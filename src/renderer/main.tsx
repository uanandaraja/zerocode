// Only initialize Sentry in production to avoid IPC errors in dev mode
if (import.meta.env.PROD) {
  import("@sentry/electron/renderer").then((Sentry) => {
    Sentry.init()
  })
}

import ReactDOM from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import { initAnalytics, shutdown } from "./lib/analytics"
import "./styles/globals.css"

// Initialize analytics
initAnalytics()

// Sync analytics opt-out status to main process
const syncOptOutStatus = async () => {
  try {
    const optOut =
      localStorage.getItem("preferences:analytics-opt-out") === "true"
    await window.desktopApi?.setAnalyticsOptOut(optOut)
  } catch (error) {
    console.warn("[Analytics] Failed to sync opt-out status:", error)
  }
}
syncOptOutStatus()

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  shutdown()
})

// Suppress ResizeObserver loop error - this is a non-fatal browser warning
// that can occur when layout changes trigger observation callbacks
// Common with virtualization libraries and diff viewers
const resizeObserverErr = /ResizeObserver loop/

// Handle both error event and unhandledrejection
window.addEventListener("error", (e) => {
  if (e.message && resizeObserverErr.test(e.message)) {
    e.stopImmediatePropagation()
    e.preventDefault()
    return false
  }
})

// Also override window.onerror for broader coverage
const originalOnError = window.onerror
window.onerror = (message, source, lineno, colno, error) => {
  if (typeof message === "string" && resizeObserverErr.test(message)) {
    return true // Suppress the error
  }
  if (originalOnError) {
    return originalOnError(message, source, lineno, colno, error)
  }
  return false
}

const rootElement = document.getElementById("root")

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />)
}
