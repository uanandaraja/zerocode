import { z } from "zod"
import { observable } from "@trpc/server/observable"
import { router, publicProcedure } from "../index"
import { serverManager, createOpenCodeTransformer, type OpenCodeEvent } from "../../opencode"
import type { UIMessageChunk } from "../../claude/types"

// Track active sessions for cancellation
const activeSessions = new Map<string, { abort: () => void; sessionId: string | null }>()

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

        // Store for cancellation
        activeSessions.set(input.subChatId, {
          abort: () => abortController.abort(),
          sessionId: currentSessionId,
        })

        const run = async () => {
          try {
            console.log("[OpenCode Router] Starting chat:", {
              subChatId: input.subChatId,
              prompt: input.prompt.slice(0, 50) + "...",
              cwd: input.cwd,
              mode: input.mode,
              provider: input.provider,
              model: input.model,
              sessionId: input.sessionId,
            })

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
                  
                  // Debug: log all events
                  console.log("[OpenCode Router] SSE event:", e.type, 
                    "sessionId:", getSessionIdFromEvent(e), 
                    "currentSessionId:", currentSessionId)
                  
                  if (e.type === "server.connected") {
                    console.log("[OpenCode Router] Connected to SSE")
                    return
                  }
                  
                  // Skip heartbeats
                  if ((e as any).type === "server.heartbeat") {
                    return
                  }

                  // Only process events for our session (if we have a session)
                  const eventSessionId = getSessionIdFromEvent(e)
                  if (eventSessionId && currentSessionId && eventSessionId !== currentSessionId) {
                    console.log("[OpenCode Router] Skipping event for different session")
                    return // Not our session
                  }

                  // Transform and emit
                  let chunkCount = 0
                  for (const chunk of transform(e)) {
                    chunkCount++
                    console.log("[OpenCode Router] Emitting chunk:", chunk.type, JSON.stringify(chunk).slice(0, 200))
                    try {
                      emit.next(chunk)
                      console.log("[OpenCode Router] emit.next succeeded for:", chunk.type)
                    } catch (emitErr) {
                      console.error("[OpenCode Router] emit.next FAILED:", emitErr)
                    }
                  }
                  if (chunkCount === 0) {
                    console.log("[OpenCode Router] No chunks generated for event:", e.type)
                  }

                  // Check for completion - session.idle means we're done
                  // The transform already emits 'finish' chunk on session.idle
                  // We need to complete AFTER the finish chunk is delivered
                  if (e.type === "session.idle") {
                    console.log("[OpenCode Router] Session idle, cleaning up")
                    activeSessions.delete(input.subChatId)
                    eventUnsubscribe?.()
                    // Don't call emit.complete() here - let the renderer close
                    // the stream when it receives the 'finish' chunk.
                    // Calling complete() immediately can cause a race where the
                    // stream closes before all chunks are delivered via IPC.
                  }
                },
                (error) => {
                  emit.next({ type: "error", errorText: error.message })
                  emit.complete()
                }
              )
              eventUnsubscribe = subscription.unsubscribe
              
              // Wait for SSE connection to be established before proceeding
              console.log("[OpenCode Router] Waiting for SSE connection...")
              await subscription.connected
              console.log("[OpenCode Router] SSE connection ready, proceeding with session")
            }

            // Create or resume session
            let sessionId = input.sessionId
            if (!sessionId) {
              console.log("[OpenCode Router] Creating new session for directory:", input.cwd)
              const result = await client.session.create({
                query: { directory: input.cwd },
                body: {},
              })
              sessionId = result.data?.id
              currentSessionId = sessionId || null
              console.log("[OpenCode Router] Session created:", sessionId, "in directory:", input.cwd)

              // Update the stored session info
              if (sessionId) {
                activeSessions.set(input.subChatId, {
                  abort: () => abortController.abort(),
                  sessionId,
                })
              }
            } else {
              console.log("[OpenCode Router] Resuming session:", sessionId)
            }

            if (!sessionId) {
              console.error("[OpenCode Router] Failed to create session")
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
            // OpenCode uses "build" for agent mode, and has a "plan" agent too
            const agent = input.mode === "plan" ? "plan" : undefined

            // Send prompt (async - response comes via SSE)
            console.log("[OpenCode Router] Sending prompt to session:", sessionId, {
              partsCount: parts.length,
              agent,
              model: input.provider && input.model
                ? { providerID: input.provider, modelID: input.model }
                : "default",
            })
            
            const promptResult = await client.session.promptAsync({
              query: { directory: input.cwd },
              path: { id: sessionId },
              body: {
                parts,
                agent,
                model: input.provider && input.model
                  ? { providerID: input.provider, modelID: input.model }
                  : undefined,
              },
            })
            console.log("[OpenCode Router] Prompt sent, result:", promptResult)
          } catch (error) {
            console.error("[OpenCode Router] Error:", error)
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
          activeSessions.delete(input.subChatId)
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
            await client.session.abort({ path: { id: session.sessionId } })
          } catch (e) {
            console.error("[OpenCode Router] Failed to abort session:", e)
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

      await client.postSessionIdPermissionsPermissionId({
        path: { id: input.sessionId, permissionID: input.permissionId },
        body: { response: input.response },
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
    } catch (e) {
      console.error("[OpenCode Router] Failed to get providers:", e)
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
      } catch (e) {
        console.error("[OpenCode Router] Failed to list sessions:", e)
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
        console.error("[OpenCode Router] Failed to get MCP status:", e)
        return { mcpServers: [], projectPath: input.projectPath, error: String(e) }
      }
    }),

  /**
   * Respond to tool approval (legacy API compatibility)
   */
  respondToolApproval: publicProcedure
    .input(
      z.object({
        toolUseId: z.string(),
        approved: z.boolean(),
        message: z.string().optional(),
        updatedInput: z.unknown().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // This maps to OpenCode's permission system
      // toolUseId is the permission ID
      const client = serverManager.getClient()
      if (!client) {
        throw new Error("OpenCode server not running")
      }

      // Find the session that has this permission
      // For now, we'll need to pass session ID separately or store it
      // This is a simplified implementation
      console.log("[OpenCode Router] Tool approval:", input)

      return { ok: true }
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
    case "todo.updated":
      return event.properties.sessionID
    default:
      return null
  }
}

export type OpencodeRouter = typeof opencodeRouter
