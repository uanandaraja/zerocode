import type { UIMessageChunk, MessageMetadata, MCPServer } from "../claude/types"
import type {
  Part,
  TextPart,
  ToolPart,
  ReasoningPart,
  StepStartPart,
  StepFinishPart,
  Message,
  AssistantMessage,
  Permission,
  SessionStatus,
  OpenCodeEvent,
} from "./types"

/**
 * Transform OpenCode SSE events to UIMessageChunk format
 * This allows us to reuse the existing UI components
 */
export function createOpenCodeTransformer() {
  let started = false
  let startTime: number | null = null

  // Track text parts for streaming
  const textPartStates = new Map<string, { started: boolean; text: string }>()
  
  // Track reasoning parts that have been started (need tool-input-start before tool-input-delta)
  const reasoningPartStarted = new Set<string>()

  // Generate unique IDs
  const genId = () => `oc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return function* transform(event: OpenCodeEvent): Generator<UIMessageChunk> {
    // Emit start once
    if (!started) {
      started = true
      startTime = Date.now()
      yield { type: "start" }
      yield { type: "start-step" }
    }

    switch (event.type) {
      case "server.connected":
        console.log("[OpenCode Transform] Server connected")
        break

      case "message.updated": {
        const message = event.properties.info
        if (message.role === "assistant") {
          const assistantMsg = message as AssistantMessage
          // Handle message completion
          if (assistantMsg.time.completed) {
            const metadata: MessageMetadata = {
              sessionId: assistantMsg.sessionID,
              inputTokens: assistantMsg.tokens.input,
              outputTokens: assistantMsg.tokens.output,
              totalTokens: assistantMsg.tokens.input + assistantMsg.tokens.output,
              totalCostUsd: assistantMsg.cost,
              durationMs: startTime ? Date.now() - startTime : undefined,
            }
            yield { type: "message-metadata", messageMetadata: metadata }
          }
          
          // Handle errors
          if (assistantMsg.error) {
            const errorMessage = getErrorMessage(assistantMsg.error)
            if (assistantMsg.error.name === "ProviderAuthError") {
              yield { type: "auth-error", errorText: errorMessage }
            } else {
              yield { type: "error", errorText: errorMessage }
            }
          }
        }
        break
      }

      case "message.part.updated": {
        const { part, delta } = event.properties
        yield* transformPart(part, delta, textPartStates, reasoningPartStarted, genId)
        break
      }

      case "message.removed":
      case "message.part.removed":
        // Could handle message/part removal if needed
        break

      case "session.status": {
        const { sessionID, status } = event.properties
        yield* handleSessionStatus(sessionID, status)
        break
      }

      case "session.idle": {
        // Session finished
        const metadata: MessageMetadata = {
          sessionId: event.properties.sessionID,
          durationMs: startTime ? Date.now() - startTime : undefined,
        }
        yield { type: "finish-step" }
        yield { type: "finish", messageMetadata: metadata }
        break
      }

      case "session.error": {
        const { error } = event.properties
        if (error) {
          yield { type: "error", errorText: getErrorMessage(error) }
        }
        break
      }

      case "permission.updated": {
        const permission = event.properties
        yield* handlePermission(permission)
        break
      }

      case "todo.updated": {
        // We could emit todo updates as a special chunk type
        // For now, we don't have a UI for this
        break
      }

      default:
        // Log unknown events for debugging
        console.log("[OpenCode Transform] Unknown event:", (event as any).type)
    }
  }
}

function* transformPart(
  part: Part,
  delta: string | undefined,
  textPartStates: Map<string, { started: boolean; text: string }>,
  reasoningPartStarted: Set<string>,
  genId: () => string
): Generator<UIMessageChunk> {
  switch (part.type) {
    case "text": {
      const textPart = part as TextPart
      const state = textPartStates.get(textPart.id) || { started: false, text: "" }
      
      if (!state.started) {
        // Start text block
        yield { type: "text-start", id: textPart.id }
        state.started = true
        textPartStates.set(textPart.id, state)
      }

      if (delta) {
        // Streaming delta
        yield { type: "text-delta", id: textPart.id, delta }
        state.text += delta
        textPartStates.set(textPart.id, state)
      } else if (textPart.text && textPart.text !== state.text) {
        // Full text update (non-streaming case)
        const newDelta = textPart.text.slice(state.text.length)
        if (newDelta) {
          yield { type: "text-delta", id: textPart.id, delta: newDelta }
          state.text = textPart.text
          textPartStates.set(textPart.id, state)
        }
      }

      // Check if text is complete
      if (textPart.time?.end) {
        yield { type: "text-end", id: textPart.id }
      }
      break
    }

    case "reasoning": {
      const reasoningPart = part as ReasoningPart
      // Map reasoning to our "Thinking" tool format
      const toolCallId = `thinking-${reasoningPart.id}`
      
      // Must emit tool-input-start before any tool-input-delta
      // The ai SDK requires this to initialize the partialToolCalls entry
      if (!reasoningPartStarted.has(toolCallId)) {
        reasoningPartStarted.add(toolCallId)
        yield {
          type: "tool-input-start",
          toolCallId,
          toolName: "Thinking",
        }
      }
      
      if (delta) {
        // Streaming reasoning
        yield {
          type: "tool-input-delta",
          toolCallId,
          inputTextDelta: delta,
        }
      } else {
        // Complete reasoning block
        yield {
          type: "tool-input-available",
          toolCallId,
          toolName: "Thinking",
          input: { text: reasoningPart.text },
        }
        yield {
          type: "tool-output-available",
          toolCallId,
          output: { completed: true },
        }
      }
      break
    }

    case "tool": {
      const toolPart = part as ToolPart
      const toolCallId = toolPart.callID || toolPart.id
      const toolName = mapToolName(toolPart.tool)

      switch (toolPart.state.status) {
        case "pending":
          // Tool starting, input streaming
          yield {
            type: "tool-input-start",
            toolCallId,
            toolName,
          }
          break

        case "running":
          // Tool input available
          yield {
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: toolPart.state.input,
          }
          break

        case "completed":
          // Tool completed
          yield {
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: toolPart.state.input,
          }
          yield {
            type: "tool-output-available",
            toolCallId,
            output: parseToolOutput(toolPart.state.output, toolPart.tool),
          }
          break

        case "error":
          yield {
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: toolPart.state.input,
          }
          yield {
            type: "tool-output-error",
            toolCallId,
            errorText: toolPart.state.error,
          }
          break
      }
      break
    }

    case "step-start": {
      yield { type: "start-step" }
      break
    }

    case "step-finish": {
      const stepPart = part as StepFinishPart
      yield { type: "finish-step" }
      break
    }

    // Subtask, file, snapshot, patch, agent, retry, compaction parts
    // can be handled as needed
    default:
      console.log("[OpenCode Transform] Unhandled part type:", part.type)
  }
}

function* handleSessionStatus(
  sessionID: string,
  status: SessionStatus
): Generator<UIMessageChunk> {
  switch (status.type) {
    case "idle":
      // Session is idle, will be handled by session.idle event
      break
    case "busy":
      // Session is busy processing
      break
    case "retry":
      // Retrying with attempt number
      console.log(`[OpenCode] Session ${sessionID} retrying, attempt ${status.attempt}`)
      break
  }
}

function* handlePermission(permission: Permission): Generator<UIMessageChunk> {
  // Map OpenCode permission to ask-user-question format
  yield {
    type: "ask-user-question",
    toolUseId: permission.id,
    questions: [
      {
        question: permission.title,
        header: "Permission",
        options: [
          { label: "Allow", description: "Allow this action" },
          { label: "Deny", description: "Deny this action" },
          { label: "Always Allow", description: "Remember this choice" },
        ],
        multiSelect: false,
      },
    ],
  }
}

// Map OpenCode tool names to our UI's expected names
function mapToolName(tool: string): string {
  const mapping: Record<string, string> = {
    bash: "Bash",
    read: "Read",
    write: "Write",
    edit: "Edit",
    glob: "Glob",
    grep: "Grep",
    webfetch: "WebFetch",
    websearch: "WebSearch",
    task: "Task",
    question: "AskUserQuestion",
    todoread: "TodoRead",
    todowrite: "TodoWrite",
    lookup_type: "LookupType",
    list_types: "ListTypes",
    skill: "Skill",
  }
  return mapping[tool.toLowerCase()] || tool
}

// Parse tool output from string to structured format
function parseToolOutput(output: string, tool: string): unknown {
  try {
    return JSON.parse(output)
  } catch {
    // Return as-is if not JSON
    return { content: output }
  }
}

// Extract error message from OpenCode error types
function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error)
  }
  
  const e = error as { name?: string; data?: { message?: string } }
  return e.data?.message || e.name || "Unknown error"
}
