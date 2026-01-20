"use client"

import { useEffect, useRef, useCallback } from "react"
import { useAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { isDesktopApp } from "../utils/platform"

// Track pending notifications count for badge
const pendingNotificationsAtom = atomWithStorage<number>(
  "desktop-pending-notifications",
  0,
)

// Track window focus state - initialize from document.hasFocus() if available
let isWindowFocused =
  typeof document !== "undefined" ? document.hasFocus() : true

/**
 * Hook to manage desktop notifications and badge count
 * - Shows native notifications when window is not focused
 * - Updates dock badge with pending notification count
 * - Clears badge when window regains focus
 */
export function useDesktopNotifications() {
  const [pendingCount, setPendingCount] = useAtom(pendingNotificationsAtom)
  const isInitialized = useRef(false)

  // Subscribe to window focus changes
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    // Initialize focus state from document
    isWindowFocused = document.hasFocus()

    const handleFocus = () => {
      isWindowFocused = true
      // Clear badge when window gains focus
      setPendingCount(0)
      window.desktopApi?.setBadge(null)
    }

    const handleBlur = () => {
      isWindowFocused = false
    }

    // Use both window events and Electron API for redundancy
    window.addEventListener("focus", handleFocus)
    window.addEventListener("blur", handleBlur)

    // Also use visibility change as a fallback (catches tab switches, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        handleFocus()
      } else if (document.visibilityState === "hidden") {
        handleBlur()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Subscribe to Electron focus events (most reliable for Electron)
    const unsubscribe = window.desktopApi?.onFocusChange?.((focused) => {
      if (focused) {
        handleFocus()
      } else {
        handleBlur()
      }
    })

    isInitialized.current = true

    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      unsubscribe?.()
    }
  }, [setPendingCount])

  // Update badge when pending count changes
  useEffect(() => {
    if (!isDesktopApp() || typeof window === "undefined") return

    if (pendingCount > 0) {
      window.desktopApi?.setBadge(pendingCount)
    } else {
      window.desktopApi?.setBadge(null)
    }
  }, [pendingCount])

  /**
   * Show a notification for agent completion
   * Only shows if window is not focused (in desktop app)
   */
  const notifyAgentComplete = useCallback(
    (agentName: string) => {
      if (!isDesktopApp() || typeof window === "undefined") return

      // Only notify if window is not focused
      if (!isWindowFocused) {
        // Increment badge count
        setPendingCount((prev) => prev + 1)

        // Show native notification
        window.desktopApi?.showNotification({
          title: "Agent finished",
          body: `${agentName} completed the task`,
        })
      }
    },
    [setPendingCount],
  )

  /**
   * Check if window is currently focused
   */
  const isAppFocused = useCallback(() => {
    return isWindowFocused
  }, [])

  return {
    notifyAgentComplete,
    isAppFocused,
    pendingCount,
    clearBadge: () => {
      setPendingCount(0)
      window.desktopApi?.setBadge(null)
    },
  }
}

/**
 * Standalone function to show notification (for use outside React components)
 */
export function showAgentNotification(agentName: string) {
  if (!isDesktopApp() || typeof window === "undefined") return

  // Only notify if window is not focused
  if (!document.hasFocus()) {
    window.desktopApi?.showNotification({
      title: "Agent finished",
      body: `${agentName} completed the task`,
    })
  }
}

/**
 * Standalone function to show notification when agent asks a question
 */
export function showAgentQuestionNotification(questionHeader?: string) {
  if (!isDesktopApp() || typeof window === "undefined") return

  // Only notify if window is not focused
  if (!document.hasFocus()) {
    window.desktopApi?.showNotification({
      title: "Agent needs input",
      body: questionHeader || "Waiting for your response",
    })
  }
}
