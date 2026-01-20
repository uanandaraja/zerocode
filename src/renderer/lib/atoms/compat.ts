/**
 * Compatibility layer for migrating from Jotai atoms to Zustand stores.
 * 
 * This file re-exports atoms that now read/write from Zustand stores,
 * allowing gradual migration without breaking existing components.
 * 
 * Usage: Components can continue using useAtom(someAtom) and it will
 * work with the new Zustand stores under the hood.
 * 
 * After full migration, this file can be deleted.
 */

import { atom } from "jotai"
import { useUIStore, useSessionStore } from "../../stores"
import type { SettingsTab } from "../../stores"

// ============================================
// UI STORE COMPAT ATOMS
// ============================================

// Dialog atoms - now backed by Zustand
export const agentsSettingsDialogOpenAtom = atom(
  (get) => useUIStore.getState().dialogs.settings,
  (get, set, value: boolean) => {
    if (value) {
      useUIStore.getState().openDialog("settings")
    } else {
      useUIStore.getState().closeDialog("settings")
    }
  }
)

export const agentsSettingsDialogActiveTabAtom = atom(
  (get) => useUIStore.getState().dialogs.settingsTab,
  (get, set, value: SettingsTab) => {
    useUIStore.getState().setSettingsTab(value)
  }
)

export const agentsShortcutsDialogOpenAtom = atom(
  (get) => useUIStore.getState().dialogs.shortcuts,
  (get, set, value: boolean) => {
    if (value) {
      useUIStore.getState().openDialog("shortcuts")
    } else {
      useUIStore.getState().closeDialog("shortcuts")
    }
  }
)

export const agentsHelpPopoverOpenAtom = atom(
  (get) => useUIStore.getState().dialogs.help,
  (get, set, value: boolean) => {
    if (value) {
      useUIStore.getState().openDialog("help")
    } else {
      useUIStore.getState().closeDialog("help")
    }
  }
)

export const agentsQuickSwitchOpenAtom = atom(
  (get) => useUIStore.getState().dialogs.quickSwitch,
  (get, set, value: boolean) => {
    if (value) {
      useUIStore.getState().openDialog("quickSwitch")
    } else {
      useUIStore.getState().closeDialog("quickSwitch")
    }
  }
)

export const agentsQuickSwitchSelectedIndexAtom = atom(
  (get) => useUIStore.getState().dialogs.quickSwitchIndex,
  (get, set, value: number) => {
    useUIStore.getState().setQuickSwitchIndex(value)
  }
)

export const subChatsQuickSwitchOpenAtom = atom(
  (get) => useUIStore.getState().dialogs.quickSwitchSessions,
  (get, set, value: boolean) => {
    if (value) {
      useUIStore.getState().openDialog("quickSwitchSessions")
    } else {
      useUIStore.getState().closeDialog("quickSwitchSessions")
    }
  }
)

export const subChatsQuickSwitchSelectedIndexAtom = atom(
  (get) => useUIStore.getState().dialogs.quickSwitchSessionsIndex,
  (get, set, value: number) => {
    useUIStore.getState().setQuickSwitchSessionsIndex(value)
  }
)

// Sidebar atoms
export const agentsSidebarOpenAtom = atom(
  (get) => useUIStore.getState().sidebar.open,
  (get, set, value: boolean) => {
    useUIStore.getState().setSidebarOpen(value)
  }
)

export const agentsSidebarWidthAtom = atom(
  (get) => useUIStore.getState().sidebar.width,
  (get, set, value: number) => {
    useUIStore.getState().setSidebarWidth(value)
  }
)

export const agentsDiffSidebarOpenAtom = atom(
  (get) => useUIStore.getState().diffSidebar.open,
  (get, set, value: boolean) => {
    useUIStore.getState().setDiffSidebarOpen(value)
  }
)

export const agentsDiffSidebarWidthAtom = atom(
  (get) => useUIStore.getState().diffSidebar.width,
  (get, set, value: number) => {
    useUIStore.getState().setDiffSidebarWidth(value)
  }
)

export const agentsPreviewSidebarOpenAtom = atom(
  (get) => useUIStore.getState().previewSidebar.open,
  (get, set, value: boolean) => {
    useUIStore.getState().setPreviewSidebarOpen(value)
  }
)

export const agentsPreviewSidebarWidthAtom = atom(
  (get) => useUIStore.getState().previewSidebar.width,
  (get, set, value: number) => {
    useUIStore.getState().setPreviewSidebarWidth(value)
  }
)

export const terminalSidebarOpenAtom = atom(
  (get) => useUIStore.getState().terminalSidebar.open,
  (get, set, value: boolean) => {
    useUIStore.getState().setTerminalSidebarOpen(value)
  }
)

export const terminalSidebarWidthAtom = atom(
  (get) => useUIStore.getState().terminalSidebar.width,
  (get, set, value: number) => {
    useUIStore.getState().setTerminalSidebarWidth(value)
  }
)

export const agentsSubChatsSidebarModeAtom = atom(
  (get) => useUIStore.getState().sessionsSidebarMode,
  (get, set, value: "tabs" | "sidebar") => {
    useUIStore.getState().setSessionsSidebarMode(value)
  }
)

export const agentsSubChatsSidebarWidthAtom = atom(
  (get) => useUIStore.getState().sessionsSidebarWidth,
  (get, set, value: number) => {
    useUIStore.getState().setSessionsSidebarWidth(value)
  }
)

export const zenModeAtom = atom(
  (get) => useUIStore.getState().zenMode,
  (get, set, value: boolean) => {
    useUIStore.getState().setZenMode(value)
  }
)

// Preference atoms
export const extendedThinkingEnabledAtom = atom(
  (get) => useUIStore.getState().preferences.extendedThinking,
  (get, set, value: boolean) => {
    useUIStore.getState().setPreference("extendedThinking", value)
  }
)

export const soundNotificationsEnabledAtom = atom(
  (get) => useUIStore.getState().preferences.soundNotifications,
  (get, set, value: boolean) => {
    useUIStore.getState().setPreference("soundNotifications", value)
  }
)

export const analyticsOptOutAtom = atom(
  (get) => useUIStore.getState().preferences.analyticsOptOut,
  (get, set, value: boolean) => {
    useUIStore.getState().setPreference("analyticsOptOut", value)
  }
)

export const ctrlTabTargetAtom = atom(
  (get) => useUIStore.getState().preferences.ctrlTabTarget,
  (get, set, value: "workspaces" | "sessions") => {
    useUIStore.getState().setPreference("ctrlTabTarget", value)
  }
)

export const selectedProviderAtom = atom(
  (get) => useUIStore.getState().preferences.selectedProvider,
  (get, set, value: string) => {
    useUIStore.getState().setPreference("selectedProvider", value)
  }
)

export const selectedModelAtom = atom(
  (get) => useUIStore.getState().preferences.selectedModel,
  (get, set, value: string) => {
    useUIStore.getState().setPreference("selectedModel", value)
  }
)

export const lastSelectedWorkModeAtom = atom(
  (get) => useUIStore.getState().preferences.workMode,
  (get, set, value: "local" | "worktree") => {
    useUIStore.getState().setPreference("workMode", value)
  }
)

// Theme atoms
export const selectedFullThemeIdAtom = atom(
  (get) => useUIStore.getState().theme.selectedId,
  (get, set, value: string | null) => {
    useUIStore.getState().setTheme("selectedId", value)
  }
)

export const systemLightThemeIdAtom = atom(
  (get) => useUIStore.getState().theme.lightThemeId,
  (get, set, value: string) => {
    useUIStore.getState().setTheme("lightThemeId", value)
  }
)

export const systemDarkThemeIdAtom = atom(
  (get) => useUIStore.getState().theme.darkThemeId,
  (get, set, value: string) => {
    useUIStore.getState().setTheme("darkThemeId", value)
  }
)

export const vscodeCodeThemeLightAtom = atom(
  (get) => useUIStore.getState().theme.codeThemeLight,
  (get, set, value: string) => {
    useUIStore.getState().setTheme("codeThemeLight", value)
  }
)

export const vscodeCodeThemeDarkAtom = atom(
  (get) => useUIStore.getState().theme.codeThemeDark,
  (get, set, value: string) => {
    useUIStore.getState().setTheme("codeThemeDark", value)
  }
)

// App state atoms
export const isDesktopAtom = atom(
  (get) => useUIStore.getState().isDesktop,
  (get, set, value: boolean) => {
    useUIStore.getState().setIsDesktop(value)
  }
)

export const isFullscreenAtom = atom(
  (get) => useUIStore.getState().isFullscreen,
  (get, set, value: boolean | null) => {
    useUIStore.getState().setIsFullscreen(value)
  }
)

export const sessionInfoAtom = atom(
  (get) => useUIStore.getState().sessionInfo,
  (get, set, value: any) => {
    useUIStore.getState().setSessionInfo(value)
  }
)

export const selectedProjectAtom = atom(
  (get) => useUIStore.getState().selectedProject,
  (get, set, value: any) => {
    useUIStore.getState().setSelectedProject(value)
  }
)

// ============================================
// SESSION STORE COMPAT ATOMS
// ============================================

export const loadingSubChatsAtom = atom(
  (get) => useSessionStore.getState().loadingSessions,
  (get, set, value: Map<string, string>) => {
    // This is a complex update - we'll handle it differently
    // For now, this is read-only through compat layer
  }
)

export const agentsUnseenChangesAtom = atom(
  (get) => useSessionStore.getState().unseenChanges,
  (get, set, value: Set<string>) => {
    // Read-only for now
  }
)

export const compactingSubChatsAtom = atom(
  (get) => useSessionStore.getState().compactingSessions,
  (get, set, value: Set<string>) => {
    // Read-only for now
  }
)

export const justCreatedIdsAtom = atom(
  (get) => useSessionStore.getState().justCreatedIds,
  (get, set, value: Set<string>) => {
    // Read-only for now
  }
)

export const pendingUserQuestionsAtom = atom(
  (get) => useSessionStore.getState().pendingQuestions,
  (get, set, value: any) => {
    useSessionStore.getState().setPendingQuestions(value)
  }
)

export const askUserQuestionResultsAtom = atom(
  (get) => useSessionStore.getState().questionResults,
  (get, set, value: Map<string, unknown>) => {
    // Complex - handle via store directly
  }
)

export const pendingPlanApprovalsAtom = atom(
  (get) => useSessionStore.getState().pendingPlanApprovals,
  (get, set, value: Set<string>) => {
    // Read-only for now
  }
)

// ============================================
// TYPE EXPORTS
// ============================================

export type { SettingsTab }
