import { create } from "zustand"
import { persist } from "zustand/middleware"

// ============================================
// TYPES
// ============================================

export type SettingsTab =
  | "appearance"
  | "preferences"
  | "skills"
  | "agents"
  | "mcp"
  | "debug"

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"

export interface UpdateState {
  status: UpdateStatus
  version?: string
  progress?: number
  bytesPerSecond?: number
  transferred?: number
  total?: number
  error?: string
  justUpdated?: boolean
  justUpdatedVersion?: string | null
}

export type MCPServerStatus = "connected" | "failed" | "pending" | "needs-auth"

export interface MCPServer {
  name: string
  status: MCPServerStatus
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
}

export interface SessionInfo {
  tools: string[]
  mcpServers: MCPServer[]
  plugins: { name: string; path: string }[]
  skills: string[]
}

export interface VSCodeFullTheme {
  id: string
  name: string
  type: "light" | "dark"
  colors: Record<string, string>
  tokenColors?: any[]
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, any>
  source: "builtin" | "imported" | "discovered"
  path?: string
}

export type AgentsMobileViewMode = "chats" | "chat" | "preview" | "diff" | "terminal"

/**
 * Represents a terminal instance in the multi-terminal system.
 * Each chat can have multiple terminal instances.
 */
export interface TerminalInstance {
  /** Unique terminal id (nanoid) */
  id: string
  /** Full paneId for TerminalManager: `${chatId}:term:${id}` */
  paneId: string
  /** Display name: "Terminal 1", "Terminal 2", etc. */
  name: string
  /** Creation timestamp */
  createdAt: number
}

export interface AgentsDebugMode {
  enabled: boolean
  simulateNoTeams: boolean
  simulateNoRepos: boolean
  simulateNoReadyRepos: boolean
  resetOnboarding: boolean
  bypassConnections: boolean
  forceStep: "workspace" | "profile" | "claude-code" | "github" | "discord" | null
  simulateCompleted: boolean
}

// ============================================
// STORE INTERFACE
// ============================================

interface UIState {
  // ═══════════════════════════════════════════
  // DIALOGS (transient - not persisted)
  // ═══════════════════════════════════════════
  dialogs: {
    settings: boolean
    settingsTab: SettingsTab
    shortcuts: boolean
    help: boolean
    quickSwitch: boolean
    quickSwitchSessions: boolean
    quickSwitchIndex: number
    quickSwitchSessionsIndex: number
  }

  // ═══════════════════════════════════════════
  // SIDEBARS (persisted)
  // ═══════════════════════════════════════════
  sidebar: { open: boolean; width: number }
  diffSidebar: { open: boolean; width: number }
  previewSidebar: { open: boolean; width: number }
  terminalSidebar: { open: boolean; width: number }
  sessionsSidebarMode: "tabs" | "sidebar"
  sessionsSidebarWidth: number
  zenMode: boolean

  // ═══════════════════════════════════════════
  // PREFERENCES (persisted)
  // ═══════════════════════════════════════════
  preferences: {
    extendedThinking: boolean
    soundNotifications: boolean
    analyticsOptOut: boolean
    ctrlTabTarget: "workspaces" | "sessions"
    selectedProvider: string
    selectedModel: string
    workMode: "local" | "worktree"
  }

  // ═══════════════════════════════════════════
  // THEME (persisted)
  // ═══════════════════════════════════════════
  theme: {
    selectedId: string | null
    lightThemeId: string
    darkThemeId: string
    codeThemeLight: string
    codeThemeDark: string
  }

  // ═══════════════════════════════════════════
  // THEME DATA (transient)
  // ═══════════════════════════════════════════
  fullThemeData: VSCodeFullTheme | null
  allThemes: VSCodeFullTheme[]

  // ═══════════════════════════════════════════
  // APP STATE (transient)
  // ═══════════════════════════════════════════
  updateState: UpdateState
  isDesktop: boolean
  isFullscreen: boolean | null
  sessionInfo: SessionInfo | null

  // ═══════════════════════════════════════════
  // SELECTED PROJECT (persisted)
  // ═══════════════════════════════════════════
  selectedProject: {
    id: string
    name: string
    path: string
    gitRemoteUrl?: string | null
    gitProvider?: "github" | "gitlab" | "bitbucket" | null
    gitOwner?: string | null
    gitRepo?: string | null
  } | null

  // ═══════════════════════════════════════════
  // AGENT MODE (persisted)
  // ═══════════════════════════════════════════
  isPlanMode: boolean
  lastSelectedModelId: string
  lastSelectedAgentId: string
  lastSelectedBranches: Record<string, string> // projectId -> branchName

  // ═══════════════════════════════════════════
  // MOBILE VIEW (transient)
  // ═══════════════════════════════════════════
  mobileViewMode: AgentsMobileViewMode

  // ═══════════════════════════════════════════
  // ARCHIVE (transient)
  // ═══════════════════════════════════════════
  archivePopoverOpen: boolean
  archiveSearchQuery: string
  archiveRepositoryFilter: string | null

  // ═══════════════════════════════════════════
  // MULTI-SELECT (transient)
  // ═══════════════════════════════════════════
  selectedWorkspaceIds: Set<string>
  selectedSessionIds: Set<string>

  // ═══════════════════════════════════════════
  // DEBUG MODE (persisted)
  // ═══════════════════════════════════════════
  debugMode: AgentsDebugMode

  // ═══════════════════════════════════════════
  // MISC TRANSIENT STATE
  // ═══════════════════════════════════════════
  selectedTeamId: string | null
  focusedDiffFile: string | null
  filteredDiffFiles: string[] | null
  pendingPrMessage: string | null
  pendingReviewMessage: string | null

  // ═══════════════════════════════════════════
  // TERMINAL STATE (persisted)
  // ═══════════════════════════════════════════
  /** Map of chatId -> terminal instances */
  terminals: Record<string, TerminalInstance[]>
  /** Map of chatId -> active terminal id */
  activeTerminalIds: Record<string, string | null>
  /** Map of paneId -> current working directory */
  terminalCwds: Record<string, string>

  // ═══════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════

  // Dialog actions
  openDialog: (name: keyof Omit<UIState["dialogs"], "settingsTab" | "quickSwitchIndex" | "quickSwitchSessionsIndex">) => void
  closeDialog: (name: keyof Omit<UIState["dialogs"], "settingsTab" | "quickSwitchIndex" | "quickSwitchSessionsIndex">) => void
  toggleDialog: (name: keyof Omit<UIState["dialogs"], "settingsTab" | "quickSwitchIndex" | "quickSwitchSessionsIndex">) => void
  closeAllDialogs: () => void
  setSettingsTab: (tab: SettingsTab) => void
  setQuickSwitchIndex: (index: number) => void
  setQuickSwitchSessionsIndex: (index: number) => void

  // Sidebar actions
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  setDiffSidebarOpen: (open: boolean) => void
  setDiffSidebarWidth: (width: number) => void
  setPreviewSidebarOpen: (open: boolean) => void
  setPreviewSidebarWidth: (width: number) => void
  setTerminalSidebarOpen: (open: boolean) => void
  setTerminalSidebarWidth: (width: number) => void
  setSessionsSidebarMode: (mode: "tabs" | "sidebar") => void
  setSessionsSidebarWidth: (width: number) => void
  setZenMode: (enabled: boolean) => void
  toggleZenMode: () => void

  // Preference actions
  setPreference: <K extends keyof UIState["preferences"]>(
    key: K,
    value: UIState["preferences"][K]
  ) => void

  // Theme actions
  setTheme: <K extends keyof UIState["theme"]>(
    key: K,
    value: UIState["theme"][K]
  ) => void
  setFullThemeData: (theme: VSCodeFullTheme | null) => void
  setAllThemes: (themes: VSCodeFullTheme[]) => void

  // App state actions
  setUpdateState: (state: Partial<UpdateState>) => void
  setIsDesktop: (isDesktop: boolean) => void
  setIsFullscreen: (isFullscreen: boolean | null) => void
  setSessionInfo: (info: SessionInfo | null) => void

  // Project actions
  setSelectedProject: (project: UIState["selectedProject"]) => void

  // Agent mode actions
  setIsPlanMode: (isPlanMode: boolean) => void
  setLastSelectedModelId: (modelId: string) => void
  setLastSelectedAgentId: (agentId: string) => void
  setLastSelectedBranch: (projectId: string, branch: string) => void

  // Mobile view actions
  setMobileViewMode: (mode: AgentsMobileViewMode) => void

  // Archive actions
  setArchivePopoverOpen: (open: boolean) => void
  setArchiveSearchQuery: (query: string) => void
  setArchiveRepositoryFilter: (filter: string | null) => void

  // Multi-select actions
  toggleWorkspaceSelection: (workspaceId: string) => void
  selectAllWorkspaces: (workspaceIds: string[]) => void
  clearWorkspaceSelection: () => void
  toggleSessionSelection: (sessionId: string) => void
  selectAllSessions: (sessionIds: string[]) => void
  clearSessionSelection: () => void

  // Debug mode actions
  setDebugMode: (mode: Partial<AgentsDebugMode>) => void

  // Misc actions
  setSelectedTeamId: (teamId: string | null) => void
  setFocusedDiffFile: (path: string | null) => void
  setFilteredDiffFiles: (files: string[] | null) => void
  setPendingPrMessage: (message: string | null) => void
  setPendingReviewMessage: (message: string | null) => void

  // Terminal actions
  setTerminals: (chatId: string, terminals: TerminalInstance[]) => void
  addTerminal: (chatId: string, terminal: TerminalInstance) => void
  removeTerminal: (chatId: string, terminalId: string) => void
  updateTerminal: (chatId: string, terminalId: string, updates: Partial<TerminalInstance>) => void
  setActiveTerminalId: (chatId: string, terminalId: string | null) => void
  setTerminalCwd: (paneId: string, cwd: string) => void
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // ═══════════════════════════════════════════
      // INITIAL STATE
      // ═══════════════════════════════════════════

      dialogs: {
        settings: false,
        settingsTab: "appearance",
        shortcuts: false,
        help: false,
        quickSwitch: false,
        quickSwitchSessions: false,
        quickSwitchIndex: 0,
        quickSwitchSessionsIndex: 0,
      },

      sidebar: { open: true, width: 224 },
      diffSidebar: { open: false, width: 500 },
      previewSidebar: { open: true, width: 500 },
      terminalSidebar: { open: false, width: 500 },
      sessionsSidebarMode: "tabs",
      sessionsSidebarWidth: 200,
      zenMode: false,

      preferences: {
        extendedThinking: false,
        soundNotifications: true,
        analyticsOptOut: false,
        ctrlTabTarget: "workspaces",
        selectedProvider: "anthropic",
        selectedModel: "claude-sonnet-4-20250514",
        workMode: "worktree",
      },

      theme: {
        selectedId: null,
        lightThemeId: "21st-light",
        darkThemeId: "21st-dark",
        codeThemeLight: "github-light",
        codeThemeDark: "github-dark",
      },

      fullThemeData: null,
      allThemes: [],

      updateState: { status: "idle" },
      isDesktop: false,
      isFullscreen: null,
      sessionInfo: null,

      selectedProject: null,

      // Agent mode
      isPlanMode: false,
      lastSelectedModelId: "sonnet",
      lastSelectedAgentId: "claude-code",
      lastSelectedBranches: {},

      // Mobile view
      mobileViewMode: "chat" as AgentsMobileViewMode,

      // Archive
      archivePopoverOpen: false,
      archiveSearchQuery: "",
      archiveRepositoryFilter: null,

      // Multi-select
      selectedWorkspaceIds: new Set<string>(),
      selectedSessionIds: new Set<string>(),

      // Debug mode
      debugMode: {
        enabled: false,
        simulateNoTeams: false,
        simulateNoRepos: false,
        simulateNoReadyRepos: false,
        resetOnboarding: false,
        bypassConnections: false,
        forceStep: null,
        simulateCompleted: false,
      },

      // Misc
      selectedTeamId: null,
      focusedDiffFile: null,
      filteredDiffFiles: null,
      pendingPrMessage: null,
      pendingReviewMessage: null,

      // Terminal state
      terminals: {},
      activeTerminalIds: {},
      terminalCwds: {},

      // ═══════════════════════════════════════════
      // ACTIONS
      // ═══════════════════════════════════════════

      // Dialog actions
      openDialog: (name) =>
        set((state) => ({
          dialogs: { ...state.dialogs, [name]: true },
        })),

      closeDialog: (name) =>
        set((state) => ({
          dialogs: { ...state.dialogs, [name]: false },
        })),

      toggleDialog: (name) =>
        set((state) => ({
          dialogs: { ...state.dialogs, [name]: !state.dialogs[name] },
        })),

      closeAllDialogs: () =>
        set((state) => ({
          dialogs: {
            ...state.dialogs,
            settings: false,
            shortcuts: false,
            help: false,
            quickSwitch: false,
            quickSwitchSessions: false,
          },
        })),

      setSettingsTab: (tab) =>
        set((state) => ({
          dialogs: { ...state.dialogs, settingsTab: tab },
        })),

      setQuickSwitchIndex: (index) =>
        set((state) => ({
          dialogs: { ...state.dialogs, quickSwitchIndex: index },
        })),

      setQuickSwitchSessionsIndex: (index) =>
        set((state) => ({
          dialogs: { ...state.dialogs, quickSwitchSessionsIndex: index },
        })),

      // Sidebar actions
      setSidebarOpen: (open) =>
        set((state) => ({
          sidebar: { ...state.sidebar, open },
        })),

      setSidebarWidth: (width) =>
        set((state) => ({
          sidebar: { ...state.sidebar, width },
        })),

      setDiffSidebarOpen: (open) =>
        set((state) => ({
          diffSidebar: { ...state.diffSidebar, open },
        })),

      setDiffSidebarWidth: (width) =>
        set((state) => ({
          diffSidebar: { ...state.diffSidebar, width },
        })),

      setPreviewSidebarOpen: (open) =>
        set((state) => ({
          previewSidebar: { ...state.previewSidebar, open },
        })),

      setPreviewSidebarWidth: (width) =>
        set((state) => ({
          previewSidebar: { ...state.previewSidebar, width },
        })),

      setTerminalSidebarOpen: (open) =>
        set((state) => ({
          terminalSidebar: { ...state.terminalSidebar, open },
        })),

      setTerminalSidebarWidth: (width) =>
        set((state) => ({
          terminalSidebar: { ...state.terminalSidebar, width },
        })),

      setSessionsSidebarMode: (mode) => set({ sessionsSidebarMode: mode }),

      setSessionsSidebarWidth: (width) => set({ sessionsSidebarWidth: width }),

      setZenMode: (enabled) => set({ zenMode: enabled }),

      toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),

      // Preference actions
      setPreference: (key, value) =>
        set((state) => ({
          preferences: { ...state.preferences, [key]: value },
        })),

      // Theme actions
      setTheme: (key, value) =>
        set((state) => ({
          theme: { ...state.theme, [key]: value },
        })),

      setFullThemeData: (theme) => set({ fullThemeData: theme }),

      setAllThemes: (themes) => set({ allThemes: themes }),

      // App state actions
      setUpdateState: (state) =>
        set((prev) => ({
          updateState: { ...prev.updateState, ...state },
        })),

      setIsDesktop: (isDesktop) => set({ isDesktop }),

      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),

      setSessionInfo: (info) => set({ sessionInfo: info }),

      // Project actions
      setSelectedProject: (project) => set({ selectedProject: project }),

      // Agent mode actions
      setIsPlanMode: (isPlanMode) => set({ isPlanMode }),
      setLastSelectedModelId: (modelId) => set({ lastSelectedModelId: modelId }),
      setLastSelectedAgentId: (agentId) => set({ lastSelectedAgentId: agentId }),
      setLastSelectedBranch: (projectId, branch) =>
        set((state) => ({
          lastSelectedBranches: { ...state.lastSelectedBranches, [projectId]: branch },
        })),

      // Mobile view actions
      setMobileViewMode: (mode) => set({ mobileViewMode: mode }),

      // Archive actions
      setArchivePopoverOpen: (open) => set({ archivePopoverOpen: open }),
      setArchiveSearchQuery: (query) => set({ archiveSearchQuery: query }),
      setArchiveRepositoryFilter: (filter) => set({ archiveRepositoryFilter: filter }),

      // Multi-select actions
      toggleWorkspaceSelection: (workspaceId) =>
        set((state) => {
          const next = new Set(state.selectedWorkspaceIds)
          if (next.has(workspaceId)) {
            next.delete(workspaceId)
          } else {
            next.add(workspaceId)
          }
          return { selectedWorkspaceIds: next }
        }),

      selectAllWorkspaces: (workspaceIds) =>
        set({ selectedWorkspaceIds: new Set(workspaceIds) }),

      clearWorkspaceSelection: () =>
        set({ selectedWorkspaceIds: new Set() }),

      toggleSessionSelection: (sessionId) =>
        set((state) => {
          const next = new Set(state.selectedSessionIds)
          if (next.has(sessionId)) {
            next.delete(sessionId)
          } else {
            next.add(sessionId)
          }
          return { selectedSessionIds: next }
        }),

      selectAllSessions: (sessionIds) =>
        set({ selectedSessionIds: new Set(sessionIds) }),

      clearSessionSelection: () =>
        set({ selectedSessionIds: new Set() }),

      // Debug mode actions
      setDebugMode: (mode) =>
        set((state) => ({
          debugMode: { ...state.debugMode, ...mode },
        })),

      // Misc actions
      setSelectedTeamId: (teamId) => set({ selectedTeamId: teamId }),
      setFocusedDiffFile: (path) => set({ focusedDiffFile: path }),
      setFilteredDiffFiles: (files) => set({ filteredDiffFiles: files }),
      setPendingPrMessage: (message) => set({ pendingPrMessage: message }),
      setPendingReviewMessage: (message) => set({ pendingReviewMessage: message }),

      // Terminal actions
      setTerminals: (chatId, terminals) =>
        set((state) => ({
          terminals: { ...state.terminals, [chatId]: terminals },
        })),

      addTerminal: (chatId, terminal) =>
        set((state) => ({
          terminals: {
            ...state.terminals,
            [chatId]: [...(state.terminals[chatId] || []), terminal],
          },
        })),

      removeTerminal: (chatId, terminalId) =>
        set((state) => ({
          terminals: {
            ...state.terminals,
            [chatId]: (state.terminals[chatId] || []).filter(
              (t) => t.id !== terminalId
            ),
          },
        })),

      updateTerminal: (chatId, terminalId, updates) =>
        set((state) => ({
          terminals: {
            ...state.terminals,
            [chatId]: (state.terminals[chatId] || []).map((t) =>
              t.id === terminalId ? { ...t, ...updates } : t
            ),
          },
        })),

      setActiveTerminalId: (chatId, terminalId) =>
        set((state) => ({
          activeTerminalIds: { ...state.activeTerminalIds, [chatId]: terminalId },
        })),

      setTerminalCwd: (paneId, cwd) =>
        set((state) => ({
          terminalCwds: { ...state.terminalCwds, [paneId]: cwd },
        })),
    }),
    {
      name: "ui-store",
      version: 2,
      partialize: (state) => ({
        // Only persist these fields
        sidebar: state.sidebar,
        diffSidebar: state.diffSidebar,
        previewSidebar: state.previewSidebar,
        terminalSidebar: state.terminalSidebar,
        sessionsSidebarMode: state.sessionsSidebarMode,
        sessionsSidebarWidth: state.sessionsSidebarWidth,
        preferences: state.preferences,
        theme: state.theme,
        selectedProject: state.selectedProject,
        // Agent mode (persisted)
        isPlanMode: state.isPlanMode,
        lastSelectedModelId: state.lastSelectedModelId,
        lastSelectedAgentId: state.lastSelectedAgentId,
        lastSelectedBranches: state.lastSelectedBranches,
        // Debug mode (persisted)
        debugMode: state.debugMode,
        // Terminal state (persisted)
        terminals: state.terminals,
        activeTerminalIds: state.activeTerminalIds,
        terminalCwds: state.terminalCwds,
        // NOT persisted: dialogs, zenMode, updateState, isDesktop, isFullscreen, sessionInfo,
        // fullThemeData, allThemes, mobileViewMode, archive*, selectedWorkspaceIds,
        // selectedSessionIds, selectedTeamId, focusedDiffFile, filteredDiffFiles,
        // pendingPrMessage, pendingReviewMessage
      }),
    }
  )
)
