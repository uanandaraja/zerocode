// Type-only imports from OpenCode SDK
// Using `import type` ensures these are erased at runtime and don't cause CJS/ESM issues
import type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  TextPart,
  ToolPart,
  ReasoningPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  Permission,
  SessionStatus,
  Todo,
  FileDiff,
  EventMessageUpdated,
  EventMessagePartUpdated,
  EventMessageRemoved,
  EventMessagePartRemoved,
  EventSessionStatus,
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionDeleted,
  EventSessionError,
  EventSessionIdle,
  EventPermissionUpdated,
  EventPermissionReplied,
  EventTodoUpdated,
} from "@opencode-ai/sdk"

// Re-export types for convenience
export type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  TextPart,
  ToolPart,
  ReasoningPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  Permission,
  SessionStatus,
  Todo,
  FileDiff,
  EventMessageUpdated,
  EventMessagePartUpdated,
  EventMessageRemoved,
  EventMessagePartRemoved,
  EventSessionStatus,
  EventSessionCreated,
  EventSessionUpdated,
  EventSessionDeleted,
  EventSessionError,
  EventSessionIdle,
  EventPermissionUpdated,
  EventPermissionReplied,
  EventTodoUpdated,
}

// OpenCode event union type
export type OpenCodeEvent =
  | { type: "server.connected"; properties: Record<string, unknown> }
  | { type: "message.updated"; properties: { info: import("@opencode-ai/sdk").Message } }
  | { type: "message.removed"; properties: { sessionID: string; messageID: string } }
  | { type: "message.part.updated"; properties: { part: import("@opencode-ai/sdk").Part; delta?: string } }
  | { type: "message.part.removed"; properties: { sessionID: string; messageID: string; partID: string } }
  | { type: "session.status"; properties: { sessionID: string; status: import("@opencode-ai/sdk").SessionStatus } }
  | { type: "session.created"; properties: { info: import("@opencode-ai/sdk").Session } }
  | { type: "session.updated"; properties: { info: import("@opencode-ai/sdk").Session } }
  | { type: "session.deleted"; properties: { info: import("@opencode-ai/sdk").Session } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: "session.error"; properties: { sessionID?: string; error?: unknown } }
  | { type: "permission.updated"; properties: import("@opencode-ai/sdk").Permission }
  | { type: "permission.replied"; properties: { sessionID: string; permissionID: string; response: string } }
  | { type: "todo.updated"; properties: { sessionID: string; todos: import("@opencode-ai/sdk").Todo[] } }
  | { type: "file.edited"; properties: { file: string } }

// Provider info
export interface ProviderInfo {
  id: string
  name: string
  models: ModelInfo[]
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
}

// Server state
export interface OpenCodeServerState {
  status: "stopped" | "starting" | "running" | "error"
  url: string | null
  error: string | null
  directory: string | null
}
