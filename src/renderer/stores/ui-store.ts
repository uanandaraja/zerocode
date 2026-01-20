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
    }),
    {
      name: "ui-store",
      version: 1,
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
        // NOT persisted: dialogs, zenMode, updateState, isDesktop, isFullscreen, sessionInfo, fullThemeData, allThemes
      }),
    }
  )
)
