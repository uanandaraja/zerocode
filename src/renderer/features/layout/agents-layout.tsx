import { useCallback, useEffect, useMemo } from "react"
import { isDesktopApp } from "../../lib/utils/platform"
import { useIsMobile } from "../../lib/hooks/use-mobile"

// New Zustand stores
import { useUIStore, useSessionStore } from "../../stores"

// Context for URL-based navigation
import { useOptionalWorkspaceContext } from "../../contexts/WorkspaceContext"

import { trpc } from "../../lib/trpc"
import { useAgentsHotkeys } from "../agents/lib/agents-hotkeys-manager"
import { AgentsSettingsDialog } from "../../components/dialogs/agents-settings-dialog"
import { AgentsShortcutsDialog } from "../../components/dialogs/agents-shortcuts-dialog"
import { TooltipProvider } from "../../components/ui/tooltip"
import { ResizableSidebar } from "../../components/ui/resizable-sidebar"
import { AgentsSidebar } from "../sidebar/agents-sidebar"
import { AgentsContent } from "../agents/ui/agents-content"
import { UpdateBanner } from "../../components/update-banner"
import { useUpdateChecker } from "../../lib/hooks/use-update-checker"

// ============================================================================
// Constants
// ============================================================================

const SIDEBAR_MIN_WIDTH = 160
const SIDEBAR_MAX_WIDTH = 300
const SIDEBAR_ANIMATION_DURATION = 0
const SIDEBAR_CLOSE_HOTKEY = "⌘\\"

// ============================================================================
// Component
// ============================================================================

export function AgentsLayout() {
  const isMobile = useIsMobile()

  // Get state and actions from Zustand stores
  const isDesktop = useUIStore((s) => s.isDesktop)
  const setIsDesktop = useUIStore((s) => s.setIsDesktop)
  const setIsFullscreen = useUIStore((s) => s.setIsFullscreen)
  
  const sidebarOpen = useUIStore((s) => s.sidebar.open)
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen)
  const sidebarWidth = useUIStore((s) => s.sidebar.width)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  
  const settingsOpen = useUIStore((s) => s.dialogs.settings)
  const setSettingsOpen = (open: boolean) => open 
    ? useUIStore.getState().openDialog("settings")
    : useUIStore.getState().closeDialog("settings")
  const setSettingsActiveTab = useUIStore((s) => s.setSettingsTab)
  
  const shortcutsOpen = useUIStore((s) => s.dialogs.shortcuts)
  const setShortcutsOpen = (open: boolean) => open
    ? useUIStore.getState().openDialog("shortcuts")
    : useUIStore.getState().closeDialog("shortcuts")
  
  const selectedProject = useUIStore((s) => s.selectedProject)
  const setSelectedProject = useUIStore((s) => s.setSelectedProject)
  
  const isZenMode = useUIStore((s) => s.zenMode)
  const setIsZenMode = useUIStore((s) => s.setZenMode)

  // Get workspace context from router (will be null on index page)
  const workspaceContext = useOptionalWorkspaceContext()
  
  // Selected workspace ID comes from URL via WorkspaceContext
  const selectedChatId = workspaceContext?.workspaceId ?? null

  // Initialize isDesktop on mount
  useEffect(() => {
    setIsDesktop(isDesktopApp())
  }, [setIsDesktop])

  // Subscribe to fullscreen changes from Electron
  useEffect(() => {
    if (
      !isDesktop ||
      typeof window === "undefined" ||
      !window.desktopApi?.windowIsFullscreen
    )
      return

    // Get initial fullscreen state
    window.desktopApi.windowIsFullscreen().then(setIsFullscreen)

    // In dev mode, HMR breaks IPC event subscriptions, so we poll instead
    const isDev = import.meta.env.DEV
    if (isDev) {
      const interval = setInterval(() => {
        window.desktopApi?.windowIsFullscreen?.().then(setIsFullscreen)
      }, 300)
      return () => clearInterval(interval)
    }

    // In production, use events (more efficient)
    const unsubscribe = window.desktopApi.onFullscreenChange?.(setIsFullscreen)
    return unsubscribe
  }, [isDesktop, setIsFullscreen])

  // Check for updates on mount and periodically
  useUpdateChecker()

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validated project - only valid if exists in DB
  // While loading, trust stored value to prevent clearing on app restart
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust stored value to prevent flicker and clearing
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB
    if (!projects) return null
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Clear invalid project from storage (only after loading completes)
  useEffect(() => {
    if (
      selectedProject &&
      projects &&
      !isLoadingProjects &&
      !validatedProject
    ) {
      setSelectedProject(null)
    }
  }, [
    selectedProject,
    projects,
    isLoadingProjects,
    validatedProject,
    setSelectedProject,
  ])

  // Hide native traffic lights when sidebar is closed (no traffic lights needed when sidebar is closed)
  useEffect(() => {
    if (!isDesktop) return
    if (
      typeof window === "undefined" ||
      !window.desktopApi?.setTrafficLightVisibility
    )
      return

    // When sidebar is closed, hide native traffic lights
    // When sidebar is open, TrafficLights component handles visibility
    if (!sidebarOpen) {
      window.desktopApi.setTrafficLightVisibility(false)
    }
  }, [sidebarOpen, isDesktop])

  // Auto-open sidebar when project is selected, close when no project
  // Only act after projects have loaded to avoid closing sidebar during initial load
  useEffect(() => {
    if (!projects) return // Don't change sidebar state while loading

    if (validatedProject) {
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }, [validatedProject, projects, setSidebarOpen])

  // Handle sign out / clear data
  const handleSignOut = useCallback(() => {
    // Clear selected project
    setSelectedProject(null)
    // Navigate to index page (which clears workspace context)
    workspaceContext?.navigateToNewWorkspace()
  }, [setSelectedProject, workspaceContext])

  // Toggle zen mode: collapse all sidebars for distraction-free focus
  // On exit, open main sidebar only (simple, predictable behavior)
  const toggleZenMode = useCallback(() => {
    if (isZenMode) {
      // Exit zen mode - open main sidebar only
      setSidebarOpen(true)
      setIsZenMode(false)
    } else {
      // Enter zen mode - close all sidebars
      setSidebarOpen(false)
      setIsZenMode(true)
    }
  }, [isZenMode, setSidebarOpen, setIsZenMode])

  // Navigate to workspace via router
  const setSelectedChatId = useCallback((id: string | null) => {
    if (id) {
      workspaceContext?.navigateToWorkspace(id)
    } else {
      workspaceContext?.navigateToNewWorkspace()
    }
  }, [workspaceContext])

  // Wrapper for setSidebarOpen that handles function updates
  const handleSetSidebarOpen = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    if (typeof open === "function") {
      const currentOpen = useUIStore.getState().sidebar.open
      setSidebarOpen(open(currentOpen))
    } else {
      setSidebarOpen(open)
    }
  }, [setSidebarOpen])

  // Initialize hotkeys manager
  useAgentsHotkeys({
    setSelectedChatId,
    setSidebarOpen: handleSetSidebarOpen,
    setSettingsDialogOpen: setSettingsOpen,
    setSettingsActiveTab,
    setShortcutsDialogOpen: setShortcutsOpen,
    toggleZenMode,
    selectedChatId,
  })

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [setSidebarOpen])

  return (
    <TooltipProvider delayDuration={300}>
      <AgentsSettingsDialog
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <AgentsShortcutsDialog
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <div className="flex w-full h-full relative overflow-hidden bg-background select-none">
        {/* Left Sidebar (Agents) */}
        <ResizableSidebar
          isOpen={!isMobile && sidebarOpen}
          onClose={handleCloseSidebar}
          width={sidebarWidth}
          setWidth={setSidebarWidth}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={SIDEBAR_MAX_WIDTH}
          side="left"
          closeHotkey={SIDEBAR_CLOSE_HOTKEY}
          animationDuration={SIDEBAR_ANIMATION_DURATION}
          initialWidth={0}
          exitWidth={0}
          showResizeTooltip={true}
          className="overflow-hidden bg-background border-r"
          style={{ borderRightWidth: "0.5px" }}
        >
          <AgentsSidebar
            onSignOut={handleSignOut}
            onToggleSidebar={handleCloseSidebar}
          />
        </ResizableSidebar>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          <AgentsContent />
        </div>

        {/* Update Banner */}
        <UpdateBanner />
      </div>
    </TooltipProvider>
  )
}
