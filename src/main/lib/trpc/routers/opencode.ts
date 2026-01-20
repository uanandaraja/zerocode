import { z } from "zod"
import { observable } from "@trpc/server/observable"
import { router, publicProcedure } from "../index"
import { serverManager, createOpenCodeTransformer, transformSessionMessages, type OpenCodeEvent, type UIMessageChunk } from "../../opencode"

// Track active sessions for cancellation
const activeSessions = new Map<string, { abort: () => void; sessionId: string | null; cwd: string }>()

export const opencodeRouter = router({
  /**
   * Main chat subscription - sends prompt and streams responses
   */
  chat: publicProcedure
    .input(
      z.object({
        chatId: z.string(),
        subChatId: z.string(),
        prompt: z.string(),
        cwd: z.string(),
        mode: z.enum(["agent", "plan"]).optional().default("agent"),
        sessionId: z.string().optional(),
        projectPath: z.string().optional(),
        // Provider selection (OpenCode supports multiple providers)
        provider: z.string().optional(), // "anthropic", "openai", "google", etc.
        model: z.string().optional(), // "claude-sonnet-4-20250514", "gpt-4o", etc.
        // Images (for multi-modal)
        images: z
          .array(
            z.object({
              mediaType: z.string(),
              base64Data: z.string(),
              filename: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .subscription(({ input }) => {
      return observable<UIMessageChunk>((emit) => {
        const abortController = new AbortController()
        let eventUnsubscribe: (() => void) | null = null
        let currentSessionId: string | null = input.sessionId || null
        let hasPendingQuestion = false // Track if we're waiting for a question answer

        // Store for cancellation
        activeSessions.set(input.subChatId, {
          abort: () => abortController.abort(),
          sessionId: currentSessionId,
          cwd: input.cwd,
        })

        const run = async () => {
          try {
            const client = serverManager.getClient()
            if (!client) {
              emit.next({ type: "error", errorText: "OpenCode server not running. Please restart the app." })
              emit.complete()
              return
            }

            const transform = createOpenCodeTransformer()

            // Subscribe to SSE events first and wait for connection
            const serverUrl = serverManager.getServerUrl()
            if (serverUrl) {
              const subscription = serverManager.subscribeToEvents(
                input.cwd,
                (event) => {
                  // Filter events for our session
                  const e = event as OpenCodeEvent
                  
                  if (e.type === "server.connected") {
                    return
                  }
                  
                  // Skip heartbeats
                  if ((e as any).type === "server.heartbeat") {
                    return
                  }

                  // Only process events for our session (if we have a session)
                  const eventSessionId = getSessionIdFromEvent(e)
                  if (eventSessionId && currentSessionId && eventSessionId !== currentSessionId) {
                    return // Not our session
                  }

                  // Transform and emit
                  for (const chunk of transform(e)) {
                    try {
                      emit.next(chunk)
                    } catch (emitErr) {
                      console.error("[OpenCode] emit.next failed:", emitErr)
                    }
                  }

                  // Track if we have a pending question
                  if (e.type === "question.asked") {
                    hasPendingQuestion = true
                  }
                  if (e.type === "question.replied" || e.type === "question.rejected") {
                    hasPendingQuestion = false
                  }

                  // Check for completion - session.idle means the AI has stopped
                  // BUT we should NOT complete if there's a pending question - the session
                  // goes idle while waiting for user input, but we need to keep listening
                  // for events after the user answers
                  if (e.type === "session.idle" && !hasPendingQuestion) {
                    activeSessions.delete(input.subChatId)
                    eventUnsubscribe?.()
                    emit.complete()
                  }
                },
                (error) => {
                  emit.next({ type: "error", errorText: error.message })
                  emit.complete()
                }
              )
              eventUnsubscribe = subscription.unsubscribe
              
              // Wait for SSE connection to be established before proceeding
              await subscription.connected
            }

            // Create or resume session
            let sessionId = input.sessionId
            if (!sessionId) {
              const result = await client.session.create({
                directory: input.cwd,
              })
              sessionId = result.data?.id
              currentSessionId = sessionId || null

              // Emit session ID immediately so the renderer can save it
              if (sessionId) {
                emit.next({
                  type: "message-metadata",
                  messageMetadata: { sessionId },
                })
              }

              // Update the stored session info
              if (sessionId) {
                activeSessions.set(input.subChatId, {
                  abort: () => abortController.abort(),
                  sessionId,
                  cwd: input.cwd,
                })
              }
            }

            if (!sessionId) {
              emit.next({ type: "error", errorText: "Failed to create session" })
              emit.complete()
              return
            }

            // Build message parts
            const parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; url: string }> = [
              { type: "text", text: input.prompt },
            ]

            // Add images if provided
            if (input.images) {
              for (const img of input.images) {
                parts.push({
                  type: "file",
                  mime: img.mediaType,
                  url: `data:${img.mediaType};base64,${img.base64Data}`,
                })
              }
            }

            // Determine agent mode
            const agent = input.mode === "plan" ? "plan" : undefined

            // Send prompt (async - response comes via SSE)
            await client.session.promptAsync({
              sessionID: sessionId,
              directory: input.cwd,
              parts,
              agent,
              model: input.provider && input.model
                ? { providerID: input.provider, modelID: input.model }
                : undefined,
            })
          } catch (error) {
            console.error("[OpenCode] Error:", error)
            emit.next({
              type: "error",
              errorText: error instanceof Error ? error.message : "Unknown error",
            })
            emit.complete()
          }
        }

        run()

        // Cleanup on unsubscribe
        return () => {
          abortController.abort()
          eventUnsubscribe?.()
          // NOTE: Don't delete from activeSessions here!
          // The cancel mutation needs access to the session info.
          // Session cleanup happens either:
          // 1. When session.idle is received (natural completion)
          // 2. After cancel mutation completes (user-initiated abort)
        }
      })
    }),

  /**
   * Cancel an active session
   */
  cancel: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .mutation(async ({ input }) => {
      const session = activeSessions.get(input.subChatId)
      
      if (session) {
        session.abort()

        // Also abort on server side
        const client = serverManager.getClient()
        if (client && session.sessionId) {
          try {
            await client.session.abort({ sessionID: session.sessionId, directory: session.cwd })
          } catch {
            // Ignore abort errors
          }
        }

        activeSessions.delete(input.subChatId)
        return { cancelled: true }
      }
      return { cancelled: false }
    }),

  /**
   * Check if a session is active
   */
  isActive: publicProcedure
    .input(z.object({ subChatId: z.string() }))
    .query(({ input }) => {
      return activeSessions.has(input.subChatId)
    }),

  /**
   * Respond to a permission request
   */
  respondPermission: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        permissionId: z.string(),
        response: z.enum(["always", "once", "reject"]),
      })
    )
    .mutation(async ({ input }) => {
      const client = serverManager.getClient()
      if (!client) {
        throw new Error("OpenCode server not running")
      }

      // Use the new v2 permission.reply API
      await client.permission.reply({
        requestID: input.permissionId,
        reply: input.response,
      })

      return { ok: true }
    }),

  /**
   * Get available providers and models (only connected providers)
   */
  providers: publicProcedure.query(async () => {
    const client = serverManager.getClient()
    if (!client) {
      return { providers: [], defaults: {}, connected: [] }
    }

    try {
      const result = await client.provider.list()
      const allProviders = result.data?.all || []
      const connectedIds = result.data?.connected || []
      const defaults = result.data?.default || {}
      
      // Filter to only connected providers
      const connectedProviders = allProviders.filter(p => connectedIds.includes(p.id))
      
      return {
        providers: connectedProviders,
        defaults,
        connected: connectedIds,
      }
    } catch {
      return { providers: [], defaults: {}, connected: [] }
    }
  }),

  /**
   * Get server status
   */
  status: publicProcedure.query(() => {
    return serverManager.getState()
  }),

  /**
   * List sessions
   */
  listSessions: publicProcedure
    .input(z.object({ directory: z.string().optional() }).optional())
    .query(async () => {
      const client = serverManager.getClient()
      if (!client) {
        return []
      }

      try {
        const result = await client.session.list()
        return result.data || []
      } catch {
        return []
      }
    }),

  /**
   * Get MCP server status
   */
  getMcpConfig: publicProcedure
    .input(z.object({ projectPath: z.string() }))
    .query(async ({ input }) => {
      const client = serverManager.getClient()
      if (!client) {
        return { mcpServers: [], projectPath: input.projectPath, error: "Server not running" }
      }

      try {
        const result = await client.mcp.status()
        const mcpServers = Object.entries(result.data || {}).map(([name, status]) => ({
          name,
          status: (status as any).status || "pending",
          config: {},
        }))
        return { mcpServers, projectPath: input.projectPath }
      } catch (e) {
        return { mcpServers: [], projectPath: input.projectPath, error: String(e) }
      }
    }),

  /**
   * Respond to question tool or tool approval
   * For questions: toolUseId is the question requestID
   * For approvals: toolUseId is the permission ID
   */
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
        subChatId: z.string().optional(), // Used to look up cwd from activeSessions
      })
    )
    .mutation(async ({ input }) => {
      const client = serverManager.getClient()
      if (!client) {
        throw new Error("OpenCode server not running")
      }

      // Check if this is a question response (updatedInput has answers)
      const questionData = input.updatedInput as { 
        questions?: Array<{ question: string }>
        answers?: Record<string, string[]> 
      } | undefined
      
      if (input.approved && questionData?.answers && questionData?.questions) {
        // This is a question response - use question API
        // Iterate over questions array to preserve order
        const answers = questionData.questions.map(q => questionData.answers![q.question] || [])
        
        // Get directory from active session
        const session = input.subChatId ? activeSessions.get(input.subChatId) : null
        try {
          await client.question.reply({
            requestID: input.toolUseId,
            answers,
            directory: session?.cwd,
          })
        } catch {
          // Question may have already been answered or timed out
        }
        return { ok: true }
      }

      // Question was rejected/skipped
      if (!input.approved) {
        const session = input.subChatId ? activeSessions.get(input.subChatId) : null
        try {
          await client.question.reject({
            requestID: input.toolUseId,
            directory: session?.cwd,
          })
        } catch {
          // Question may have already been answered or timed out
        }
        return { ok: true }
      }

      return { ok: true }
    }),

  /**
   * Get messages for a session
   * Used to load persisted messages from OpenCode instead of SQLite
   */
  getSessionMessages: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        directory: z.string(),
      })
    )
    .query(async ({ input }) => {
      const client = serverManager.getClient()
      if (!client) {
        return { messages: [], sessionId: input.sessionId }
      }

      try {
        const result = await client.session.messages({
          sessionID: input.sessionId,
          directory: input.directory,
        })

        // Use type assertion since v2 types are compatible at runtime
        const messages = transformSessionMessages(result.data as Parameters<typeof transformSessionMessages>[0] || [])
        return { messages, sessionId: input.sessionId }
      } catch (error) {
        console.error("[OpenCode] Failed to load session messages:", error)
        return { messages: [], sessionId: input.sessionId }
      }
    }),
})

// Helper to extract session ID from various event types
function getSessionIdFromEvent(event: OpenCodeEvent): string | null {
  switch (event.type) {
    case "message.updated":
      return event.properties.info.sessionID
    case "message.part.updated":
      return event.properties.part.sessionID
    case "message.removed":
    case "message.part.removed":
      return event.properties.sessionID
    case "session.status":
    case "session.idle":
      return event.properties.sessionID
    case "session.created":
    case "session.updated":
    case "session.deleted":
      return event.properties.info.id
    case "session.error":
      return event.properties.sessionID || null
    case "permission.updated":
      return event.properties.sessionID
    case "permission.replied":
      return event.properties.sessionID
    case "question.asked":
      return event.properties.sessionID
    case "question.replied":
    case "question.rejected":
      return event.properties.sessionID
    case "todo.updated":
      return event.properties.sessionID
    default:
      return null
  }
}

export type OpencodeRouter = typeof opencodeRouter
