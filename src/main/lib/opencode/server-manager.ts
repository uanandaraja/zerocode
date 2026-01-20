import { EventEmitter } from "events"
import { spawn, type ChildProcess } from "child_process"
import os from "os"
import path from "path"
import fs from "fs"
import type { OpenCodeServerState } from "./types"

// Type-only imports (these are erased at runtime)
// Using v2 SDK which has the question API
import type { OpencodeClient } from "@opencode-ai/sdk/v2"

const DEFAULT_PORT = 4096
const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORT}`

// Dynamically imported SDK functions
let createOpencodeClient: typeof import("@opencode-ai/sdk/v2").createOpencodeClient

/**
 * Find the opencode binary by checking common install locations
 * Returns the full path to the binary, or null if not found
 */
function findOpencodeBinary(): string | null {
  // Common install locations for opencode
  const commonPaths = [
    path.join(os.homedir(), ".bun", "bin"),       // bun global installs
    path.join(os.homedir(), ".local", "bin"),     // pipx/cargo style
    "/usr/local/bin",
    "/opt/homebrew/bin",                           // Homebrew on Apple Silicon
    "/usr/bin",
  ]
  
  for (const dir of commonPaths) {
    const binPath = path.join(dir, "opencode")
    if (fs.existsSync(binPath)) {
      console.log("[OpenCode] Found binary at:", binPath)
      return binPath
    }
  }
  
  console.warn("[OpenCode] opencode binary not found - please install it: bun install -g opencode-ai")
  return null
}

/**
 * Spawn the opencode server directly using the full binary path
 * This avoids PATH resolution issues in Electron apps launched from Finder/Dock
 */
function spawnOpencodeServer(options: {
  hostname?: string
  port?: number
  timeout?: number
}): Promise<{ url: string; process: ChildProcess; close: () => void }> {
  const { hostname = "127.0.0.1", port = DEFAULT_PORT, timeout = 30000 } = options
  
  const binaryPath = findOpencodeBinary()
  if (!binaryPath) {
    return Promise.reject(new Error("opencode binary not found. Please install it: bun install -g opencode-ai"))
  }
  
  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`]
  
  console.log("[OpenCode] Spawning server:", binaryPath, args.join(" "))
  
  const proc = spawn(binaryPath, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      proc.kill()
      reject(new Error(`Timeout waiting for server to start after ${timeout}ms`))
    }, timeout)
    
    let output = ""
    
    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.includes("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) {
            clearTimeout(timeoutId)
            console.log("[OpenCode] Server started at:", match[1])
            resolve({
              url: match[1],
              process: proc,
              close: () => proc.kill(),
            })
            return
          }
        }
      }
    })
    
    proc.stderr?.on("data", (chunk) => {
      const text = chunk.toString()
      output += text
      // Also log stderr for debugging (warnings, etc)
      if (text.trim()) {
        console.log("[OpenCode] Server stderr:", text.trim())
      }
    })
    
    proc.on("error", (error) => {
      clearTimeout(timeoutId)
      reject(new Error(`Failed to spawn opencode: ${error.message}`))
    })
    
    proc.on("exit", (code) => {
      clearTimeout(timeoutId)
      if (code !== 0) {
        let msg = `Server exited with code ${code}`
        if (output.trim()) {
          msg += `\nOutput: ${output}`
        }
        reject(new Error(msg))
      }
    })
  })
}

async function loadSdk() {
  if (!createOpencodeClient) {
    // Client from v2 SDK (has question API)
    const sdkV2 = await import("@opencode-ai/sdk/v2")
    createOpencodeClient = sdkV2.createOpencodeClient
  }
}

/**
 * Check if an OpenCode server is already running on the default port
 */
async function checkExistingServer(): Promise<boolean> {
  try {
    const response = await fetch(`${DEFAULT_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

class OpenCodeServerManager extends EventEmitter {
  private server: { url: string; close: () => void } | null = null
  private client: OpencodeClient | null = null
  private usingExternalServer = false
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

      // Load SDK dynamically (ESM module)
      await loadSdk()

      // Check if a server is already running on the default port
      const existingServerRunning = await checkExistingServer()
      
      if (existingServerRunning) {
        // Reuse the existing server
        console.log("[OpenCode] Found existing server, connecting to it")
        this.usingExternalServer = true
        this.server = null // We didn't start it, so we shouldn't close it
        
        // Create client pointing to existing server
        this.client = createOpencodeClient({
          baseUrl: DEFAULT_URL,
          directory,
        })
      } else {
        // Start a new server using our own spawn function
        // This uses the full binary path to avoid PATH resolution issues in Electron
        this.usingExternalServer = false
        this.server = await spawnOpencodeServer({
          hostname: "127.0.0.1",
          port: DEFAULT_PORT,
          timeout: 30000, // 30 seconds timeout
        })

        // Create client
        this.client = createOpencodeClient({
          baseUrl: this.server.url,
          directory,
        })
      }

      // Verify connection by getting project info (lightweight check)
      try {
        await this.client.project.list()
      } catch {
        // It's okay if this fails - server might not have a project yet
      }

      this.state = {
        status: "running",
        url: this.usingExternalServer ? DEFAULT_URL : this.server!.url,
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
    // Only close the server if we started it (not if we connected to an existing one)
    if (this.server && !this.usingExternalServer) {
      this.server.close()
    }
    this.server = null
    this.usingExternalServer = false

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
    if (!this.state.url) {
      throw new Error("Server not running")
    }

    // Build the SSE URL with directory query param
    const eventSourceUrl = `${this.state.url}/event?directory=${encodeURIComponent(directory)}`

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

        resolveConnected()

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
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
                  onEvent(data)
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return
        }
        rejectConnected(error as Error)
        onError?.(error as Error)
      }
    })()

    return {
      unsubscribe: () => {
        abortController.abort()
      },
      connected: connectedPromise,
    }
  }
}

// Singleton instance
export const serverManager = new OpenCodeServerManager()
