import type { Chat } from "@ai-sdk/react"

/**
 * Simple module-level storage for Chat SDK instances.
 * Lives outside React lifecycle so chats persist across component mount/unmount.
 *
 * This is NOT a Zustand store because:
 * 1. Chat instances are non-serializable
 * 2. No React subscription needed (not UI state)
 * 3. Simple CRUD operations are sufficient
 */

const instances = new Map<string, Chat<any>>()
const streamIds = new Map<string, string | null>()
const workspaceIds = new Map<string, string>() // sessionId → workspaceId
const manuallyAborted = new Map<string, boolean>()

export const chatInstanceStore = {
  /**
   * Get a Chat instance by session ID
   */
  get: (sessionId: string) => instances.get(sessionId),

  /**
   * Store a Chat instance with its associated workspace ID
   */
  set: (sessionId: string, chat: Chat<any>, workspaceId: string) => {
    instances.set(sessionId, chat)
    workspaceIds.set(sessionId, workspaceId)
  },

  /**
   * Check if a Chat instance exists
   */
  has: (sessionId: string) => instances.has(sessionId),

  /**
   * Delete a Chat instance and all associated data
   */
  delete: (sessionId: string) => {
    instances.delete(sessionId)
    streamIds.delete(sessionId)
    workspaceIds.delete(sessionId)
    manuallyAborted.delete(sessionId)
  },

  /**
   * Get the workspace ID for a session
   */
  getWorkspaceId: (sessionId: string) => workspaceIds.get(sessionId),

  /**
   * Get the current stream ID for a session
   */
  getStreamId: (sessionId: string) => streamIds.get(sessionId),

  /**
   * Set the current stream ID for a session
   */
  setStreamId: (sessionId: string, streamId: string | null) => {
    streamIds.set(sessionId, streamId)
  },

  /**
   * Mark a session as manually aborted (to prevent completion sound)
   */
  setManuallyAborted: (sessionId: string, aborted: boolean) => {
    manuallyAborted.set(sessionId, aborted)
  },

  /**
   * Check if a session was manually aborted
   */
  wasManuallyAborted: (sessionId: string) =>
    manuallyAborted.get(sessionId) ?? false,

  /**
   * Clear the manually aborted flag
   */
  clearManuallyAborted: (sessionId: string) => {
    manuallyAborted.delete(sessionId)
  },

  /**
   * Clear all stored data
   */
  clear: () => {
    instances.clear()
    streamIds.clear()
    workspaceIds.clear()
    manuallyAborted.clear()
  },
}
