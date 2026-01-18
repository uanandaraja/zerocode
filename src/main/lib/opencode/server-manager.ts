import { EventEmitter } from "events"
import type { OpenCodeServerState } from "./types"

// Type-only imports (these are erased at runtime)
import type { OpencodeClient } from "@opencode-ai/sdk"

// Dynamically imported SDK functions
let createOpencodeServer: typeof import("@opencode-ai/sdk").createOpencodeServer
let createOpencodeClient: typeof import("@opencode-ai/sdk").createOpencodeClient

async function loadSdk() {
  if (!createOpencodeServer || !createOpencodeClient) {
    const sdk = await import("@opencode-ai/sdk")
    createOpencodeServer = sdk.createOpencodeServer
    createOpencodeClient = sdk.createOpencodeClient
  }
}

class OpenCodeServerManager extends EventEmitter {
  private server: { url: string; close: () => void } | null = null
  private client: OpencodeClient | null = null
  private state: OpenCodeServerState = {
    status: "stopped",
    url: null,
    error: null,
    directory: null,
  }

  constructor() {
    super()
  }

  getState(): OpenCodeServerState {
    return { ...this.state }
  }

  getClient(): OpencodeClient | null {
    return this.client
  }

  getServerUrl(): string | null {
    return this.state.url
  }

  isRunning(): boolean {
    return this.state.status === "running" && this.client !== null
  }

  async start(directory?: string): Promise<void> {
    if (this.state.status === "running") {
      console.log("[OpenCode] Server already running")
      return
    }

    try {
      this.state = {
        status: "starting",
        url: null,
        error: null,
        directory: directory || null,
      }
      this.emit("state-change", this.state)

      console.log("[OpenCode] Starting server...")

      // Load SDK dynamically (ESM module)
      await loadSdk()

      // Use SDK to start the server
      this.server = await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
        timeout: 30000, // 30 seconds timeout
      })

      console.log(`[OpenCode] Server started at ${this.server.url}`)

      // Create client
      this.client = createOpencodeClient({
        baseUrl: this.server.url,
        directory,
      })

      // Verify connection by getting project info (lightweight check)
      try {
        const projects = await this.client.project.list()
        console.log(`[OpenCode] Server connection verified, projects: ${projects.data?.length ?? 0}`)
      } catch (e) {
        // It's okay if this fails - server might not have a project yet
        console.log("[OpenCode] Server started (no projects yet)")
      }

      this.state = {
        status: "running",
        url: this.server.url,
        error: null,
        directory: directory || null,
      }
      this.emit("state-change", this.state)
    } catch (error) {
      console.error("[OpenCode] Failed to start server:", error)
      this.state = {
        status: "error",
        url: null,
        error: error instanceof Error ? error.message : String(error),
        directory: null,
      }
      this.emit("state-change", this.state)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    console.log("[OpenCode] Shutting down server...")

    // Close server
    if (this.server) {
      this.server.close()
      this.server = null
    }

    this.client = null
    this.state = {
      status: "stopped",
      url: null,
      error: null,
      directory: null,
    }
    this.emit("state-change", this.state)
  }

  // Subscribe to SSE events using manual fetch (more reliable in Electron)
  // Returns { unsubscribe, connected } where connected is a promise that resolves when SSE is connected
  subscribeToEvents(
    directory: string,
    onEvent: (event: unknown) => void,
    onError?: (error: Error) => void
  ): { unsubscribe: () => void; connected: Promise<void> } {
    if (!this.server) {
      throw new Error("Server not running")
    }

    // Build the SSE URL with directory query param
    const eventSourceUrl = `${this.server.url}/event?directory=${encodeURIComponent(directory)}`
    console.log(`[OpenCode] Subscribing to SSE: ${eventSourceUrl}`)

    const abortController = new AbortController()
    let resolveConnected!: () => void
    let rejectConnected!: (err: Error) => void
    const connectedPromise = new Promise<void>((resolve, reject) => {
      resolveConnected = resolve
      rejectConnected = reject
    })
    
    ;(async () => {
      try {
        const response = await fetch(eventSourceUrl, {
          headers: { 
            "Accept": "text/event-stream",
            "Cache-Control": "no-cache",
          },
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error("No response body for SSE")
        }

        console.log("[OpenCode] SSE connection established")
        resolveConnected()

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log("[OpenCode] SSE stream ended")
            break
          }

          buffer += decoder.decode(value, { stream: true })
          
          // SSE events are separated by double newlines
          const events = buffer.split("\n\n")
          // Keep the last incomplete chunk in buffer
          buffer = events.pop() || ""

          for (const eventChunk of events) {
            if (!eventChunk.trim()) continue
            
            // Parse SSE format: "data: {...}"
            const lines = eventChunk.split("\n")
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const jsonStr = line.slice(6) // Remove "data: " prefix
                try {
                  const data = JSON.parse(jsonStr)
                  console.log("[OpenCode] SSE event:", data.type)
                  onEvent(data)
                } catch (e) {
                  console.warn("[OpenCode] SSE parse error:", e, "raw:", jsonStr.slice(0, 100))
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          console.log("[OpenCode] SSE subscription aborted")
          return
        }
        console.error("[OpenCode] SSE error:", error)
        rejectConnected(error as Error)
        onError?.(error as Error)
      }
    })()

    return {
      unsubscribe: () => {
        console.log("[OpenCode] Unsubscribing from SSE")
        abortController.abort()
      },
      connected: connectedPromise,
    }
  }
}

// Singleton instance
export const serverManager = new OpenCodeServerManager()
