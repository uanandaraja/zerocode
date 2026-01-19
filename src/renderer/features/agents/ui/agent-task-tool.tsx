"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import { AgentToolRegistry, getToolStatus } from "./agent-tool-registry"
import { AgentToolCall } from "./agent-tool-call"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { AgentTodoTool } from "./agent-todo-tool"
import { AgentBashTool } from "./agent-bash-tool"
import { areTaskToolPropsEqual } from "./agent-tool-utils"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { cn } from "../../../lib/utils"

interface AgentTaskToolProps {
  part: any
  nestedTools: any[]
  nestedToolsMap?: Map<string, any[]>
  chatStatus?: string
  subChatId?: string
}

// Constants for rendering
const MAX_VISIBLE_TOOLS = 5
const TOOL_HEIGHT_PX = 24

// Format elapsed time in a human-readable format
function formatElapsedTime(ms: number): string {
  if (ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

export const AgentTaskTool = memo(function AgentTaskTool({
  part,
  nestedTools,
  nestedToolsMap,
  chatStatus,
  subChatId,
}: AgentTaskToolProps) {
  const { isPending, isInterrupted } = getToolStatus(part, chatStatus)

  // Default: expanded while streaming, collapsed when done
  const [isManuallyToggled, setIsManuallyToggled] = useState(false)
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track elapsed time for running tasks
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  const description = part.input?.description || ""
  const subagentType = part.input?.subagent_type || part.input?.subagentType || ""
  const prompt = part.input?.prompt || ""

  // Expanded state: auto-expand while running, collapse when done (unless manually toggled)
  const isExpanded = isManuallyToggled ? isManuallyExpanded : isPending

  const handleToggle = () => {
    setIsManuallyToggled(true)
    setIsManuallyExpanded(!isExpanded)
  }

  // Track elapsed time while task is running
  useEffect(() => {
    if (isPending) {
      // Start tracking time
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current)
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isPending])

  // Use output duration from Claude Code if available, otherwise use our tracked time
  const outputDuration = part.output?.duration || part.output?.duration_ms
  const displayMs = !isPending && outputDuration ? outputDuration : elapsedMs
  const elapsedTimeDisplay = formatElapsedTime(displayMs)

  // Auto-scroll to bottom when streaming and new nested tools added
  useEffect(() => {
    if (isPending && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [nestedTools.length, isPending, isExpanded])

  const hasNestedTools = nestedTools.length > 0

  // Build subtitle - always show description
  const getSubtitle = () => {
    if (description) {
      const truncated = description.length > 60 
        ? description.slice(0, 57) + "..." 
        : description
      return truncated
    }
    return ""
  }

  const subtitle = getSubtitle()

  // Get title text - show subagent type if available
  const getTitle = () => {
    if (subagentType) {
      // Capitalize first letter and add "Agent"
      const formatted = subagentType.charAt(0).toUpperCase() + subagentType.slice(1)
      return `${formatted} Agent`
    }
    return isPending ? "Running Task" : "Task"
  }

  // Show interrupted state if task was interrupted without completing
  if (isInterrupted && !part.output) {
    return <AgentToolInterrupted toolName="Task" subtitle={subtitle} />
  }

  return (
    <div>
      {/* Header - clickable to toggle, same style as AgentExploringGroup */}
      <div
        onClick={handleToggle}
        className="group flex items-start gap-1.5 py-0.5 px-2 cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            {/* Title with shimmer effect when running */}
            {isPending ? (
              <TextShimmer
                as="span"
                duration={1.2}
                className="font-medium whitespace-nowrap flex-shrink-0"
              >
                {getTitle()}
              </TextShimmer>
            ) : (
              <span className="font-medium whitespace-nowrap flex-shrink-0 text-muted-foreground">
                {getTitle()}
              </span>
            )}
            {subtitle && (
              <span className="text-muted-foreground truncate">
                {subtitle}
              </span>
            )}
            {/* Show elapsed time while running or final time when done */}
            {elapsedTimeDisplay && (
              <span className="text-muted-foreground/50 tabular-nums flex-shrink-0">
                {elapsedTimeDisplay}
              </span>
            )}
            {/* Chevron right after text - rotates when expanded */}
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
                isExpanded && "rotate-90",
                !isExpanded && "opacity-0 group-hover:opacity-100",
              )}
            />
          </div>
        </div>
      </div>

      {/* Expanded content - show when expanded */}
      {isExpanded && (
        <div className="relative mt-1">
          {/* Show prompt/description when no nested tools yet */}
          {!hasNestedTools && prompt && (
            <div className="text-xs text-muted-foreground py-1 px-2 whitespace-pre-wrap">
              {prompt}
            </div>
          )}

          {/* Nested tools */}
          {hasNestedTools && (
            <>
              {/* Top gradient fade when streaming and has many items */}
              <div
                className={cn(
                  "absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
                  isPending && nestedTools.length > MAX_VISIBLE_TOOLS
                    ? "opacity-100"
                    : "opacity-0",
                )}
              />

              {/* Scrollable container - auto-scrolls to bottom when streaming */}
              <div
                ref={scrollRef}
                className={cn(
                  "space-y-1.5",
                  isPending &&
                    nestedTools.length > MAX_VISIBLE_TOOLS &&
                    "overflow-y-auto scrollbar-hide",
                )}
                style={
                  isPending && nestedTools.length > MAX_VISIBLE_TOOLS
                    ? { maxHeight: `${MAX_VISIBLE_TOOLS * TOOL_HEIGHT_PX}px` }
                    : undefined
                }
              >
                {nestedTools.map((nestedPart, idx) => {
                  // Handle nested Task tools recursively
                  if (nestedPart.type === "tool-Task") {
                    const nestedNestedTools = nestedToolsMap?.get(nestedPart.toolCallId) || []
                    return (
                      <div key={idx} className="pl-2 border-l border-border/40">
                        <AgentTaskTool
                          part={nestedPart}
                          nestedTools={nestedNestedTools}
                          nestedToolsMap={nestedToolsMap}
                          chatStatus={chatStatus}
                          subChatId={subChatId}
                        />
                      </div>
                    )
                  }

                  // Handle nested TodoWrite with full todo list UI
                  if (nestedPart.type === "tool-TodoWrite") {
                    return (
                      <AgentTodoTool
                        key={idx}
                        part={nestedPart}
                        chatStatus={chatStatus}
                        subChatId={subChatId}
                      />
                    )
                  }

                  // Handle nested Bash with full output display
                  if (nestedPart.type === "tool-Bash") {
                    return (
                      <AgentBashTool
                        key={idx}
                        part={nestedPart}
                        chatStatus={chatStatus}
                      />
                    )
                  }

                  const nestedMeta = AgentToolRegistry[nestedPart.type]
                  if (!nestedMeta) {
                    return (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground py-0.5 px-2"
                      >
                        {nestedPart.type?.replace("tool-", "")}
                      </div>
                    )
                  }
                  const { isPending: nestedIsPending, isError: nestedIsError } =
                    getToolStatus(nestedPart, chatStatus)
                  return (
                    <AgentToolCall
                      key={idx}
                      icon={nestedMeta.icon}
                      title={nestedMeta.title(nestedPart)}
                      subtitle={nestedMeta.subtitle?.(nestedPart)}
                      isPending={nestedIsPending}
                      isError={nestedIsError}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}, areTaskToolPropsEqual)
