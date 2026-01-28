import { createContext, useContext, type ReactNode } from "react"

/**
 * Context for workspace and session IDs from URL.
 * This bridges TanStack Router params to child components.
 */

interface WorkspaceContextValue {
  /** Current workspace ID from URL params */
  workspaceId: string | null
  /** Current session ID from URL search params */
  sessionId: string | null
  /** Navigate to a different workspace */
  navigateToWorkspace: (workspaceId: string) => void
  /** Navigate to a different session within current workspace */
  navigateToSession: (sessionId: string) => void
  /** Navigate to new workspace form */
  navigateToNewWorkspace: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({
  children,
  workspaceId,
  sessionId,
  navigateToWorkspace,
  navigateToSession,
  navigateToNewWorkspace,
}: {
  children: ReactNode
  workspaceId: string | null
  sessionId: string | null
  navigateToWorkspace: (workspaceId: string) => void
  navigateToSession: (sessionId: string) => void
  navigateToNewWorkspace: () => void
}) {
  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId,
        sessionId,
        navigateToWorkspace,
        navigateToSession,
        navigateToNewWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspaceContext must be used within WorkspaceProvider")
  }
  return context
}

/**
 * Optional hook that returns null if not in workspace context.
 * Useful for components that may or may not be in a workspace.
 */
export function useOptionalWorkspaceContext() {
  return useContext(WorkspaceContext)
}
