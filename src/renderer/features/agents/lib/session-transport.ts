import * as Sentry from "@sentry/electron/renderer"
import type { ChatTransport, UIMessage } from "ai"
import { toast } from "sonner"
import { showAgentQuestionNotification } from "../../../lib/hooks/use-desktop-notifications"
import { trpcClient } from "../../../lib/trpc"
import type { SessionInfo } from "../../../stores"

// ============================================
// ERROR CONFIGURATION
// ============================================

const ERROR_TOAST_CONFIG: Record<
  string,
  {
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
> = {
  AUTH_FAILED_SDK: {
    title: "Not logged in",
    description: "Run 'claude login' in your terminal to authenticate",
    action: {
      label: "Copy command",
      onClick: () => navigator.clipboard.writeText("claude login"),
    },
  },
  INVALID_API_KEY_SDK: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  INVALID_API_KEY: {
    title: "Invalid API key",
    description:
      "Your Claude API key is invalid. Check your CLI configuration.",
  },
  RATE_LIMIT_SDK: {
    title: "Rate limited",
    description: "Too many requests. Please wait a moment and try again.",
  },
  RATE_LIMIT: {
    title: "Rate limited",
    description: "Too many requests. Please wait a moment and try again.",
  },
  OVERLOADED_SDK: {
    title: "Claude is busy",
    description:
      "The service is overloaded. Please try again in a few moments.",
  },
  PROCESS_CRASH: {
    title: "Claude crashed",
    description:
      "The Claude process exited unexpectedly. Try sending your message again.",
  },
  EXECUTABLE_NOT_FOUND: {
    title: "Claude CLI not found",
    description:
      "Install Claude Code CLI: npm install -g @anthropic-ai/claude-code",
    action: {
      label: "Copy command",
      onClick: () =>
        navigator.clipboard.writeText(
          "npm install -g @anthropic-ai/claude-code"
        ),
    },
  },
  NETWORK_ERROR: {
    title: "Network error",
    description: "Check your internet connection and try again.",
  },
  AUTH_FAILURE: {
    title: "Authentication failed",
    description: "Your session may have expired. Try logging in again.",
  },
}

// ============================================
// TYPES
// ============================================

type UIMessageChunk = any

type ImageAttachment = {
  base64Data: string
  mediaType: string
  filename?: string
}

export type PendingQuestion = {
  sessionId: string
  toolUseId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}

/**
 * Configuration for SessionTransport
 * Uses dependency injection instead of reading global state
 */
export type SessionTransportConfig = {
  // Identity
  workspaceId: string
  sessionId: string
  cwd: string
  projectPath?: string
  mode: "plan" | "agent"

  // Injected preferences (instead of reading from global atoms)
  provider: string
  model: string
  thinkingEnabled: boolean

  // Callbacks (instead of writing to global atoms)
  callbacks: {
    onPendingQuestion: (question: PendingQuestion | null) => void
    onQuestionTimeout: (toolUseId: string) => void
    onQuestionResult: (toolUseId: string, result: unknown) => void
    onSessionInfo: (info: SessionInfo) => void
    onSessionNameUpdate: (name: string) => void
    onCompactingChange: (isCompacting: boolean) => void
  }
}

// ============================================
// SESSION TRANSPORT
// ============================================

/**
 * Transport layer for AI chat sessions.
 * Refactored to use dependency injection - no global state access.
 */
export class SessionTransport implements ChatTransport<UIMessage> {
  constructor(private config: SessionTransportConfig) {}

  async sendMessages(options: {
    messages: UIMessage[]
    abortSignal?: AbortSignal
  }): Promise<ReadableStream<UIMessageChunk>> {
    // Extract prompt and images from last user message
    const lastUser = [...options.messages]
      .reverse()
      .find((m) => m.role === "user")
    const prompt = this.extractText(lastUser)
    const images = this.extractImages(lastUser)

    // Get sessionId for resume from last assistant message metadata
    const lastAssistant = [...options.messages]
      .reverse()
      .find((m) => m.role === "assistant")
    const resumeSessionId = (lastAssistant as any)?.metadata?.sessionId

    // Use injected values from config
    const { provider, model, mode, thinkingEnabled } = this.config
    const maxThinkingTokens = thinkingEnabled ? 128_000 : undefined

    return new ReadableStream({
      start: (controller) => {
        // Subscribe to OpenCode chat stream
        const sub = trpcClient.opencode.chat.subscribe(
          {
            subChatId: this.config.sessionId,
            chatId: this.config.workspaceId,
            prompt,
            cwd: this.config.cwd,
            projectPath: this.config.projectPath,
            mode,
            sessionId: resumeSessionId,
            provider,
            model,
            ...(images.length > 0 && { images }),
          },
          {
            onData: (chunk: UIMessageChunk) => {
              this.handleChunk(chunk, controller)
            },
            onError: (err: Error) => {
              // Track transport errors in Sentry
              Sentry.captureException(err, {
                tags: {
                  errorCategory: "TRANSPORT_ERROR",
                  mode,
                },
                extra: {
                  cwd: this.config.cwd,
                  workspaceId: this.config.workspaceId,
                  sessionId: this.config.sessionId,
                },
              })
              controller.error(err)
            },
            onComplete: () => {
              try {
                controller.close()
              } catch {
                // Already closed
              }
            },
          }
        )

        // Handle abort signal
        options.abortSignal?.addEventListener("abort", () => {
          console.log(
            "[SessionTransport] Abort signal received for sessionId:",
            this.config.sessionId
          )
          sub.unsubscribe()
          trpcClient.opencode.cancel
            .mutate({ subChatId: this.config.sessionId })
            .then((result) =>
              console.log("[SessionTransport] Cancel result:", result)
            )
            .catch((err) =>
              console.error("[SessionTransport] Cancel error:", err)
            )
          try {
            controller.close()
          } catch {
            // Already closed
          }
        })
      },
      cancel: () => {
        // Stream cancelled by consumer
      },
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null // Not needed for local app
  }

  // ============================================
  // CHUNK HANDLERS
  // ============================================

  private handleChunk(
    chunk: UIMessageChunk,
    controller: ReadableStreamDefaultController<UIMessageChunk>
  ) {
    const { callbacks, sessionId, workspaceId, mode, cwd } = this.config

    // Handle AskUserQuestion - show question UI
    if (chunk.type === "ask-user-question") {
      callbacks.onPendingQuestion({
        sessionId,
        toolUseId: chunk.toolUseId,
        questions: chunk.questions,
      })
      // Show notification if window not focused
      showAgentQuestionNotification(chunk.questions?.[0]?.header)
    }

    // Handle AskUserQuestion timeout
    if (chunk.type === "ask-user-question-timeout") {
      callbacks.onQuestionTimeout(chunk.toolUseId)
    }

    // Handle AskUserQuestion result
    if (chunk.type === "ask-user-question-result") {
      callbacks.onQuestionResult(chunk.toolUseId, chunk.result)
    }

    // Handle compacting status
    if (chunk.type === "system-Compact") {
      const isCompacting = chunk.state === "input-streaming"
      callbacks.onCompactingChange(isCompacting)
    }

    // Handle session init - store MCP servers, plugins, tools info
    if (chunk.type === "session-init") {
      callbacks.onSessionInfo({
        tools: chunk.tools,
        mcpServers: chunk.mcpServers,
        plugins: chunk.plugins,
        skills: chunk.skills,
      })
    }

    // Handle message metadata - save sessionId for resume
    if (chunk.type === "message-metadata" && chunk.messageMetadata?.sessionId) {
      trpcClient.chats.updateSubChatSession
        .mutate({
          id: sessionId,
          sessionId: chunk.messageMetadata.sessionId,
        })
        .catch(() => {
          // Ignore save errors - session resume is a nice-to-have
        })
    }

    // Handle session title - update session name
    if (chunk.type === "session-title" && chunk.title) {
      callbacks.onSessionNameUpdate(chunk.title)
      // Also persist to database
      trpcClient.chats.renameSubChat
        .mutate({
          id: sessionId,
          name: chunk.title,
        })
        .catch(() => {
          // Ignore save errors
        })
    }

    // Clear pending questions when agent has moved on
    const shouldClearQuestion =
      chunk.type !== "ask-user-question" &&
      chunk.type !== "ask-user-question-timeout" &&
      chunk.type !== "ask-user-question-result" &&
      !chunk.type.startsWith("tool-input") &&
      chunk.type !== "start" &&
      chunk.type !== "start-step"

    if (shouldClearQuestion) {
      callbacks.onPendingQuestion(null)
    }

    // Handle authentication errors
    if (chunk.type === "auth-error") {
      toast.error("Authentication Error", {
        description: "Please configure your API key in OpenCode settings.",
      })
      controller.error(new Error("Authentication required"))
      return
    }

    // Handle errors
    if (chunk.type === "error") {
      const category = chunk.debugInfo?.category || "UNKNOWN"
      
      // Track error in Sentry
      Sentry.captureException(
        new Error(chunk.errorText || "Session transport error"),
        {
          tags: {
            errorCategory: category,
            mode,
          },
          extra: {
            debugInfo: chunk.debugInfo,
            cwd,
            workspaceId,
            sessionId,
          },
        }
      )

      // Show toast based on error category
      const toastConfig = ERROR_TOAST_CONFIG[category]
      if (toastConfig) {
        toast.error(toastConfig.title, {
          description: toastConfig.description,
          duration: 8000,
          action: toastConfig.action
            ? {
                label: toastConfig.action.label,
                onClick: toastConfig.action.onClick,
              }
            : undefined,
        })
      } else {
        toast.error("Something went wrong", {
          description: chunk.errorText || "An unexpected error occurred",
          duration: 8000,
        })
      }
    }

    // Enqueue chunk to stream
    try {
      controller.enqueue(chunk)
    } catch {
      // Stream already closed
    }

    // Close stream on finish
    if (chunk.type === "finish") {
      try {
        controller.close()
      } catch {
        // Already closed
      }
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  private extractText(msg: UIMessage | undefined): string {
    if (!msg) return ""
    if (msg.parts) {
      return msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    }
    return ""
  }

  private extractImages(msg: UIMessage | undefined): ImageAttachment[] {
    if (!msg || !msg.parts) return []

    const images: ImageAttachment[] = []

    for (const part of msg.parts) {
      if (part.type === "data-image" && (part as any).data) {
        const data = (part as any).data
        if (data.base64Data && data.mediaType) {
          images.push({
            base64Data: data.base64Data,
            mediaType: data.mediaType,
            filename: data.filename,
          })
        }
      }
    }

    return images
  }
}

// ============================================
// LEGACY EXPORT (for gradual migration)
// ============================================

/**
 * @deprecated Use SessionTransport with dependency injection instead.
 * This export maintains backwards compatibility during migration.
 */
export { SessionTransport as IPCChatTransport }
