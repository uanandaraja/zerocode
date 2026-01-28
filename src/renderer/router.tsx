import { useCallback, useEffect, useMemo } from "react"
import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { ThemeProvider, useTheme } from "next-themes"
import { Toaster } from "sonner"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { TooltipProvider } from "./components/ui/tooltip"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { SelectRepoPage } from "./features/onboarding"
import { AgentsLayout } from "./features/layout/agents-layout"
import { WorkspaceProvider } from "./contexts/WorkspaceContext"
import { useUIStore, useSessionStore } from "./stores"
import { trpc } from "./lib/trpc"

// ============================================
// ROOT LAYOUT
// ============================================

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  )
}

function RootLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <VSCodeThemeProvider>
        <TooltipProvider delayDuration={100}>
          <TRPCProvider>
            <div
              data-agents-page
              className="h-screen w-screen bg-background text-foreground overflow-hidden"
            >
              <Outlet />
            </div>
            <ThemedToaster />
          </TRPCProvider>
        </TooltipProvider>
      </VSCodeThemeProvider>
    </ThemeProvider>
  )
}

// ============================================
// INDEX PAGE - Project Selection / Redirect
// ============================================

function IndexPage() {
  const navigate = useNavigate()
  const selectedProject = useUIStore((s) => s.selectedProject)
  const { data: projects, isLoading } = trpc.projects.list.useQuery()

  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    if (isLoading) return selectedProject
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoading])

  // Fetch workspaces for redirect
  const { data: workspaces } = trpc.chats.list.useQuery(
    { projectId: validatedProject?.id ?? "" },
    { enabled: !!validatedProject?.id }
  )

  useEffect(() => {
    if (validatedProject && workspaces && workspaces.length > 0) {
      const sorted = [...workspaces].sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return bTime - aTime
      })
      if (sorted[0]) {
        navigate({
          to: "/workspace/$workspaceId",
          params: { workspaceId: sorted[0].id },
          search: {},
        })
      }
    }
  }, [validatedProject, workspaces, navigate])

  if (!validatedProject && !isLoading) {
    return <SelectRepoPage />
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  )
}

// ============================================
// NEW WORKSPACE PAGE - Creating a new workspace
// ============================================

function NewWorkspacePage() {
  const navigate = useNavigate()

  // Clear workspace in session store
  const setWorkspaceId = useSessionStore((s) => s.setWorkspaceId)
  useEffect(() => {
    setWorkspaceId(null)
  }, [setWorkspaceId])

  // Navigation callbacks for child components
  const navigateToWorkspace = useCallback(
    (newWorkspaceId: string) => {
      navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId: newWorkspaceId },
        search: {},
      })
    },
    [navigate]
  )

  const navigateToSession = useCallback(
    (_newSessionId: string) => {
      // No-op when creating new workspace (no workspace yet)
    },
    []
  )

  const navigateToNewWorkspace = useCallback(() => {
    // Already on new workspace page
  }, [])

  return (
    <WorkspaceProvider
      workspaceId={null}
      sessionId={null}
      navigateToWorkspace={navigateToWorkspace}
      navigateToSession={navigateToSession}
      navigateToNewWorkspace={navigateToNewWorkspace}
    >
      <AgentsLayout />
    </WorkspaceProvider>
  )
}

// ============================================
// WORKSPACE PAGE - Main App View
// ============================================

function WorkspacePage() {
  const navigate = useNavigate()
  const { workspaceId } = useParams({ from: "/workspace/$workspaceId" })
  const { sessionId } = useSearch({ from: "/workspace/$workspaceId" })

  // Initialize session store with workspaceId when it changes
  const setWorkspaceId = useSessionStore((s) => s.setWorkspaceId)
  useEffect(() => {
    setWorkspaceId(workspaceId)
  }, [workspaceId, setWorkspaceId])

  // Navigation callbacks for child components
  const navigateToWorkspace = useCallback(
    (newWorkspaceId: string) => {
      navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId: newWorkspaceId },
        search: {},
      })
    },
    [navigate]
  )

  const navigateToSession = useCallback(
    (newSessionId: string) => {
      navigate({
        to: "/workspace/$workspaceId",
        params: { workspaceId },
        search: { sessionId: newSessionId },
      })
    },
    [navigate, workspaceId]
  )

  const navigateToNewWorkspace = useCallback(() => {
    navigate({ to: "/workspace/new" })
  }, [navigate])

  return (
    <WorkspaceProvider
      workspaceId={workspaceId}
      sessionId={sessionId ?? null}
      navigateToWorkspace={navigateToWorkspace}
      navigateToSession={navigateToSession}
      navigateToNewWorkspace={navigateToNewWorkspace}
    >
      <AgentsLayout />
    </WorkspaceProvider>
  )
}

// ============================================
// ROUTE DEFINITIONS
// ============================================

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
})

const newWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/new",
  component: NewWorkspacePage,
})

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/$workspaceId",
  validateSearch: (search: Record<string, unknown>): { sessionId?: string } => ({
    sessionId: search.sessionId as string | undefined,
  }),
  component: WorkspacePage,
})

// ============================================
// ROUTER TREE & INSTANCE
// ============================================

// Note: newWorkspaceRoute must come before workspaceRoute so "/workspace/new" 
// doesn't get matched as a workspaceId parameter
const routeTree = rootRoute.addChildren([indexRoute, newWorkspaceRoute, workspaceRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
})

// ============================================
// TYPE DECLARATIONS
// ============================================

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
