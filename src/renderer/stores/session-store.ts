import { create } from "zustand"
import { persist } from "zustand/middleware"

// ============================================
// TYPES
// ============================================

export interface SessionMeta {
  id: string
  name: string
  createdAt?: string
  updatedAt?: string
  mode?: "plan" | "agent"
}

export interface ScrollPositionData {
  scrollTop: number
  scrollHeight: number
  messageCount: number
  wasStreaming: boolean
  lastAssistantMsgId?: string
}

export interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

export interface TodoState {
  todos: TodoItem[]
  creationToolCallId: string | null
}

export interface MobileDeviceSettings {
  width: number
  height: number
  preset: string
}

export interface SubChatFileChange {
  filePath: string
  displayPath: string
  additions: number
  deletions: number
}

// Work mode preference (local = work in project dir, worktree = create isolated worktree)
export type WorkMode = "local" | "worktree"

// Pending user questions from AskUserQuestion tool
export type PendingUserQuestions = {
  subChatId: string
  toolUseId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}

// Unified undo stack for workspace and sub-chat archivation
export type UndoItem =
  | { type: "workspace"; chatId: string; timeoutId: ReturnType<typeof setTimeout> }
  | { type: "subchat"; subChatId: string; chatId: string; timeoutId: ReturnType<typeof setTimeout> }

// Constants for user questions
export const QUESTIONS_SKIPPED_MESSAGE = "User skipped questions - proceed with defaults"
export const QUESTIONS_TIMED_OUT_MESSAGE = "Timed out"

// ============================================
// CUSTOM EVENT FOR TAB CHANGES
// ============================================

export const OPEN_SESSIONS_CHANGE_EVENT = "open-sessions-change"

// ============================================
// LOCALSTORAGE HELPERS
// ============================================

const getStorageKey = (workspaceId: string, type: "open" | "active" | "pinned") =>
  `workspace-${type}-sessions-${workspaceId}`

const saveToLS = (workspaceId: string, type: "open" | "active" | "pinned", value: unknown) => {
  if (typeof window === "undefined") return
  localStorage.setItem(getStorageKey(workspaceId, type), JSON.stringify(value))
}

const loadFromLS = <T>(workspaceId: string, type: "open" | "active" | "pinned", fallback: T): T => {
  if (typeof window === "undefined") return fallback
  try {
    const stored = localStorage.getItem(getStorageKey(workspaceId, type))
    return stored ? JSON.parse(stored) : fallback
  } catch {
    return fallback
  }
}

// ============================================
// STORE INTERFACE
// ============================================

interface SessionState {
  // ═══════════════════════════════════════════
  // WORKSPACE CONTEXT
  // ═══════════════════════════════════════════
  workspaceId: string | null

  // ═══════════════════════════════════════════
  // TAB STATE (persisted per workspace via localStorage)
  // ═══════════════════════════════════════════
  activeSessionId: string | null
  openSessionIds: string[]
  pinnedSessionIds: string[]

  // ═══════════════════════════════════════════
  // SESSION METADATA (cached from DB)
  // ═══════════════════════════════════════════
  allSessions: SessionMeta[]

  // ═══════════════════════════════════════════
  // TRANSIENT STATE
  // ═══════════════════════════════════════════
  loadingSessions: Map<string, string> // sessionId → workspaceId
  unseenChanges: Set<string>
  compactingSessions: Set<string>
  justCreatedIds: Set<string>

  // ═══════════════════════════════════════════
  // PER-SESSION UI STATE
  // ═══════════════════════════════════════════
  scrollPositions: Record<string, ScrollPositionData>
  previewPaths: Record<string, string>
  viewportModes: Record<string, "desktop" | "mobile">
  previewScales: Record<string, number>
  mobileDevices: Record<string, MobileDeviceSettings>
  diffSidebarOpen: Record<string, boolean>
  todos: Record<string, TodoState>

  // ═══════════════════════════════════════════
  // PENDING STATE (for transport callbacks)
  // ═══════════════════════════════════════════
  pendingQuestions: {
    sessionId: string
    toolUseId: string
    questions: Array<{
      question: string
      header: string
      options: Array<{ label: string; description: string }>
      multiSelect: boolean
    }>
  } | null
  questionResults: Map<string, unknown> // toolUseId → result
  pendingPlanApprovals: Set<string>

  // ═══════════════════════════════════════════
  // FILE CHANGES TRACKING
  // ═══════════════════════════════════════════
  subChatFiles: Map<string, SubChatFileChange[]> // sessionId → file changes
  subChatToChatMap: Map<string, string> // sessionId → workspaceId

  // ═══════════════════════════════════════════
  // ACTIONS - Workspace
  // ═══════════════════════════════════════════
  setWorkspaceId: (id: string | null) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Tab Management
  // ═══════════════════════════════════════════
  setActiveSession: (sessionId: string) => void
  setOpenSessions: (sessionIds: string[]) => void
  addToOpenSessions: (sessionId: string) => void
  removeFromOpenSessions: (sessionId: string) => void
  togglePinSession: (sessionId: string) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Session Metadata
  // ═══════════════════════════════════════════
  setAllSessions: (sessions: SessionMeta[]) => void
  addSession: (session: SessionMeta) => void
  updateSessionName: (sessionId: string, name: string) => void
  updateSessionMode: (sessionId: string, mode: "plan" | "agent") => void
  updateSessionTimestamp: (sessionId: string) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Loading/Status
  // ═══════════════════════════════════════════
  setLoading: (sessionId: string, workspaceId: string) => void
  clearLoading: (sessionId: string) => void
  markSeen: (sessionId: string) => void
  markUnseen: (sessionId: string) => void
  clearAllUnseen: () => void
  setCompacting: (sessionId: string, compacting: boolean) => void
  addJustCreated: (id: string) => void
  removeJustCreated: (id: string) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Per-Session UI
  // ═══════════════════════════════════════════
  setScrollPosition: (sessionId: string, data: ScrollPositionData) => void
  getScrollPosition: (sessionId: string) => ScrollPositionData | undefined
  setPreviewPath: (sessionId: string, path: string) => void
  setViewportMode: (sessionId: string, mode: "desktop" | "mobile") => void
  setPreviewScale: (sessionId: string, scale: number) => void
  setMobileDevice: (sessionId: string, device: MobileDeviceSettings) => void
  setDiffSidebarOpen: (sessionId: string, open: boolean) => void
  setTodos: (sessionId: string, state: TodoState) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Pending Questions
  // ═══════════════════════════════════════════
  setPendingQuestions: (questions: SessionState["pendingQuestions"]) => void
  setQuestionResult: (toolUseId: string, result: unknown) => void
  clearQuestionResult: (toolUseId: string) => void
  addPendingPlanApproval: (sessionId: string) => void
  removePendingPlanApproval: (sessionId: string) => void

  // ═══════════════════════════════════════════
  // ACTIONS - File Changes
  // ═══════════════════════════════════════════
  setSubChatFiles: (sessionId: string, files: SubChatFileChange[]) => void
  setSubChatToChatMap: (sessionId: string, chatId: string) => void

  // ═══════════════════════════════════════════
  // ACTIONS - Reset
  // ═══════════════════════════════════════════
  reset: () => void
}

// ============================================
// SCROLL POSITIONS CACHE (for sync access)
// ============================================

const scrollPositionsCache = new Map<string, ScrollPositionData>()

export const scrollPositionsCacheStore = {
  get: (sessionId: string): ScrollPositionData | undefined =>
    scrollPositionsCache.get(sessionId),
  set: (sessionId: string, data: ScrollPositionData) => {
    scrollPositionsCache.set(sessionId, data)
  },
  delete: (sessionId: string) => {
    scrollPositionsCache.delete(sessionId)
  },
  clear: () => {
    scrollPositionsCache.clear()
  },
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // ═══════════════════════════════════════════
      // INITIAL STATE
      // ═══════════════════════════════════════════

      workspaceId: null,
      activeSessionId: null,
      openSessionIds: [],
      pinnedSessionIds: [],
      allSessions: [],

      loadingSessions: new Map(),
      unseenChanges: new Set(),
      compactingSessions: new Set(),
      justCreatedIds: new Set(),

      scrollPositions: {},
      previewPaths: {},
      viewportModes: {},
      previewScales: {},
      mobileDevices: {},
      diffSidebarOpen: {},
      todos: {},

      pendingQuestions: null,
      questionResults: new Map(),
      pendingPlanApprovals: new Set(),

      subChatFiles: new Map(),
      subChatToChatMap: new Map(),

      // ═══════════════════════════════════════════
      // ACTIONS - Workspace
      // ═══════════════════════════════════════════

      setWorkspaceId: (id) => {
        if (!id) {
          set({
            workspaceId: null,
            activeSessionId: null,
            openSessionIds: [],
            pinnedSessionIds: [],
            allSessions: [],
          })
          return
        }

        // Load tab state from localStorage for this workspace
        const openSessionIds = loadFromLS<string[]>(id, "open", [])
        const activeSessionId = loadFromLS<string | null>(id, "active", null)
        const pinnedSessionIds = loadFromLS<string[]>(id, "pinned", [])

        set({
          workspaceId: id,
          openSessionIds,
          activeSessionId,
          pinnedSessionIds,
          allSessions: [],
        })
      },

      // ═══════════════════════════════════════════
      // ACTIONS - Tab Management
      // ═══════════════════════════════════════════

      setActiveSession: (sessionId) => {
        const { workspaceId } = get()
        set({ activeSessionId: sessionId })
        if (workspaceId) saveToLS(workspaceId, "active", sessionId)
      },

      setOpenSessions: (sessionIds) => {
        const { workspaceId } = get()
        set({ openSessionIds: sessionIds })
        if (workspaceId) saveToLS(workspaceId, "open", sessionIds)
        window.dispatchEvent(new CustomEvent(OPEN_SESSIONS_CHANGE_EVENT))
      },

      addToOpenSessions: (sessionId) => {
        const { openSessionIds, workspaceId } = get()
        if (openSessionIds.includes(sessionId)) return
        const newIds = [...openSessionIds, sessionId]
        set({ openSessionIds: newIds })
        if (workspaceId) saveToLS(workspaceId, "open", newIds)
        window.dispatchEvent(new CustomEvent(OPEN_SESSIONS_CHANGE_EVENT))
      },

      removeFromOpenSessions: (sessionId) => {
        const { openSessionIds, activeSessionId, workspaceId } = get()
        const newIds = openSessionIds.filter((id) => id !== sessionId)

        // If closing active tab, switch to last remaining tab
        let newActive = activeSessionId
        if (activeSessionId === sessionId) {
          newActive = newIds[newIds.length - 1] || null
        }

        set({ openSessionIds: newIds, activeSessionId: newActive })
        if (workspaceId) {
          saveToLS(workspaceId, "open", newIds)
          saveToLS(workspaceId, "active", newActive)
        }
        window.dispatchEvent(new CustomEvent(OPEN_SESSIONS_CHANGE_EVENT))
      },

      togglePinSession: (sessionId) => {
        const { pinnedSessionIds, workspaceId } = get()
        const newPinnedIds = pinnedSessionIds.includes(sessionId)
          ? pinnedSessionIds.filter((id) => id !== sessionId)
          : [...pinnedSessionIds, sessionId]

        set({ pinnedSessionIds: newPinnedIds })
        if (workspaceId) saveToLS(workspaceId, "pinned", newPinnedIds)
      },

      // ═══════════════════════════════════════════
      // ACTIONS - Session Metadata
      // ═══════════════════════════════════════════

      setAllSessions: (sessions) => set({ allSessions: sessions }),

      addSession: (session) => {
        const { allSessions } = get()
        if (allSessions.some((s) => s.id === session.id)) return
        set({ allSessions: [...allSessions, session] })
      },

      updateSessionName: (sessionId, name) => {
        const { allSessions } = get()
        set({
          allSessions: allSessions.map((s) =>
            s.id === sessionId ? { ...s, name } : s
          ),
        })
      },

      updateSessionMode: (sessionId, mode) => {
        const { allSessions } = get()
        set({
          allSessions: allSessions.map((s) =>
            s.id === sessionId ? { ...s, mode } : s
          ),
        })
      },

      updateSessionTimestamp: (sessionId) => {
        const { allSessions } = get()
        const newTimestamp = new Date().toISOString()
        set({
          allSessions: allSessions.map((s) =>
            s.id === sessionId ? { ...s, updatedAt: newTimestamp } : s
          ),
        })
      },

      // ═══════════════════════════════════════════
      // ACTIONS - Loading/Status
      // ═══════════════════════════════════════════

      setLoading: (sessionId, workspaceId) => {
        const { loadingSessions } = get()
        if (loadingSessions.get(sessionId) === workspaceId) return
        const next = new Map(loadingSessions)
        next.set(sessionId, workspaceId)
        set({ loadingSessions: next })
      },

      clearLoading: (sessionId) => {
        const { loadingSessions } = get()
        if (!loadingSessions.has(sessionId)) return
        const next = new Map(loadingSessions)
        next.delete(sessionId)
        set({ loadingSessions: next })
      },

      markSeen: (sessionId) => {
        const { unseenChanges } = get()
        if (!unseenChanges.has(sessionId)) return
        const next = new Set(unseenChanges)
        next.delete(sessionId)
        set({ unseenChanges: next })
      },

      markUnseen: (sessionId) => {
        const { unseenChanges } = get()
        if (unseenChanges.has(sessionId)) return
        const next = new Set(unseenChanges)
        next.add(sessionId)
        set({ unseenChanges: next })
      },

      clearAllUnseen: () => set({ unseenChanges: new Set() }),

      setCompacting: (sessionId, compacting) => {
        const { compactingSessions } = get()
        const next = new Set(compactingSessions)
        if (compacting) {
          next.add(sessionId)
        } else {
          next.delete(sessionId)
        }
        set({ compactingSessions: next })
      },

      addJustCreated: (id) => {
        const { justCreatedIds } = get()
        const next = new Set(justCreatedIds)
        next.add(id)
        set({ justCreatedIds: next })
      },

      removeJustCreated: (id) => {
        const { justCreatedIds } = get()
        const next = new Set(justCreatedIds)
        next.delete(id)
        set({ justCreatedIds: next })
      },

      // ═══════════════════════════════════════════
      // ACTIONS - Per-Session UI
      // ═══════════════════════════════════════════

      setScrollPosition: (sessionId, data) => {
        scrollPositionsCacheStore.set(sessionId, data)
        set((state) => ({
          scrollPositions: { ...state.scrollPositions, [sessionId]: data },
        }))
      },

      getScrollPosition: (sessionId) => {
        // Try cache first for sync access
        const cached = scrollPositionsCacheStore.get(sessionId)
        if (cached) return cached
        return get().scrollPositions[sessionId]
      },

      setPreviewPath: (sessionId, path) =>
        set((state) => ({
          previewPaths: { ...state.previewPaths, [sessionId]: path },
        })),

      setViewportMode: (sessionId, mode) =>
        set((state) => ({
          viewportModes: { ...state.viewportModes, [sessionId]: mode },
        })),

      setPreviewScale: (sessionId, scale) =>
        set((state) => ({
          previewScales: { ...state.previewScales, [sessionId]: scale },
        })),

      setMobileDevice: (sessionId, device) =>
        set((state) => ({
          mobileDevices: { ...state.mobileDevices, [sessionId]: device },
        })),

      setDiffSidebarOpen: (sessionId, open) =>
        set((state) => ({
          diffSidebarOpen: { ...state.diffSidebarOpen, [sessionId]: open },
        })),

      setTodos: (sessionId, state) =>
        set((prev) => ({
          todos: { ...prev.todos, [sessionId]: state },
        })),

      // ═══════════════════════════════════════════
      // ACTIONS - Pending Questions
      // ═══════════════════════════════════════════

      setPendingQuestions: (questions) => set({ pendingQuestions: questions }),

      setQuestionResult: (toolUseId, result) => {
        const { questionResults } = get()
        const next = new Map(questionResults)
        next.set(toolUseId, result)
        set({ questionResults: next })
      },

      clearQuestionResult: (toolUseId) => {
        const { questionResults } = get()
        const next = new Map(questionResults)
        next.delete(toolUseId)
        set({ questionResults: next })
      },

      addPendingPlanApproval: (sessionId) => {
        const { pendingPlanApprovals } = get()
        const next = new Set(pendingPlanApprovals)
        next.add(sessionId)
        set({ pendingPlanApprovals: next })
      },

      removePendingPlanApproval: (sessionId) => {
        const { pendingPlanApprovals } = get()
        const next = new Set(pendingPlanApprovals)
        next.delete(sessionId)
        set({ pendingPlanApprovals: next })
      },

      // ═══════════════════════════════════════════
      // ACTIONS - File Changes
      // ═══════════════════════════════════════════

      setSubChatFiles: (sessionId, files) => {
        const { subChatFiles } = get()
        const next = new Map(subChatFiles)
        next.set(sessionId, files)
        set({ subChatFiles: next })
      },

      setSubChatToChatMap: (sessionId, chatId) => {
        const { subChatToChatMap } = get()
        const next = new Map(subChatToChatMap)
        next.set(sessionId, chatId)
        set({ subChatToChatMap: next })
      },

      // ═══════════════════════════════════════════
      // ACTIONS - Reset
      // ═══════════════════════════════════════════

      reset: () => {
        scrollPositionsCacheStore.clear()
        set({
          workspaceId: null,
          activeSessionId: null,
          openSessionIds: [],
          pinnedSessionIds: [],
          allSessions: [],
          loadingSessions: new Map(),
          unseenChanges: new Set(),
          compactingSessions: new Set(),
          justCreatedIds: new Set(),
          pendingQuestions: null,
          questionResults: new Map(),
          pendingPlanApprovals: new Set(),
        })
      },
    }),
    {
      name: "session-store",
      version: 1,
      partialize: (state) => ({
        // Persist per-session UI state
        scrollPositions: state.scrollPositions,
        previewPaths: state.previewPaths,
        viewportModes: state.viewportModes,
        previewScales: state.previewScales,
        mobileDevices: state.mobileDevices,
        diffSidebarOpen: state.diffSidebarOpen,
        todos: state.todos,
        // Tab state is persisted separately via localStorage per workspace
        // NOT persisted: workspaceId, activeSessionId, openSessionIds, pinnedSessionIds,
        // allSessions, loadingSessions, unseenChanges, compactingSessions, justCreatedIds,
        // pendingQuestions, questionResults, pendingPlanApprovals
      }),
      // Handle Map/Set serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name)
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          localStorage.removeItem(name)
        },
      },
    }
  )
)
