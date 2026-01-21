"use client"

import { memo, useState, useMemo, useCallback } from "react"
import { useTheme } from "next-themes"
import { PatchDiff } from "@pierre/diffs/react"
import { createPatch } from "diff"
import { Columns2, Rows2 } from "lucide-react"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { useUIStore } from "../../../stores"
import { DiffModeEnum } from "./agent-diff-view"
import { cn } from "../../../lib/utils"
import { useShikiTheme } from "../../../lib/themes/theme-provider"

interface AgentEditToolProps {
  part: any
  chatStatus?: string
}

/**
 * Map custom theme IDs to Shiki bundled themes that Pierre supports
 */
const PIERRE_THEME_MAP: Record<string, string> = {
  "21st-dark": "github-dark",
  "21st-light": "github-light",
  "opencode-dark": "github-dark",
  "opencode-light": "github-light",
  "claude-dark": "github-dark",
  "claude-light": "github-light",
  "cursor-dark": "github-dark",
  "cursor-light": "github-light",
  "cursor-midnight": "github-dark",
  "vesper-dark": "vesper",
  "vesper": "vesper",
  "vitesse-dark": "vitesse-dark",
  "vitesse-light": "vitesse-light",
  "min-dark": "min-dark",
  "min-light": "min-light",
  "github-dark": "github-dark",
  "github-light": "github-light",
}

function getPierreTheme(themeId: string, isDark: boolean): string {
  if (themeId in PIERRE_THEME_MAP) {
    return PIERRE_THEME_MAP[themeId]
  }
  return isDark ? "github-dark" : "github-light"
}

export const AgentEditTool = memo(function AgentEditTool({
  part,
  chatStatus,
}: AgentEditToolProps) {
  // Start expanded by default to show full diff
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { isPending, isInterrupted } = getToolStatus(part, chatStatus)
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme !== "dark"
  // Use the same theme as the diff sidebar (from user preferences)
  const shikiTheme = useShikiTheme()
  // Use local state with localStorage persistence for diff view mode
  const [diffMode, setDiffMode] = useState<DiffModeEnum>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("agents-diff:view-mode")
      if (stored === "split") return DiffModeEnum.Split
    }
    return DiffModeEnum.Unified
  })

  // Use UI store for opening diff sidebar and focusing on file
  const setDiffSidebarOpen = useUIStore((state) => state.setDiffSidebarOpen)
  const setFocusedDiffFile = useUIStore((state) => state.setFocusedDiffFile)

  // Determine mode: Write (create new file) vs Edit (modify existing)
  const isWriteMode = part.type === "tool-Write"
  // Only consider streaming if chat is actively streaming (prevents spinner hang on stop)
  const isInputStreaming = part.state === "input-streaming" && chatStatus === "streaming"

  // Get file path - check both camelCase and snake_case
  const filePath = part.input?.filePath || part.input?.file_path || ""
  
  // Get content for Write mode
  const writeContent = part.input?.content || ""
  
  // Get filediff from metadata (new API structure)
  // Try multiple locations where the filediff might be stored
  const filediff = part.metadata?.filediff || part.output?.filediff || part.output?.metadata?.filediff
  
  // Fallback: if no filediff, try to construct from input (old_string -> new_string)
  const oldString = part.input?.oldString || part.input?.old_string || ""
  const newString = part.input?.newString || part.input?.new_string || ""
  
  // Extract filename from path
  const filename = filePath ? filePath.split("/").pop() || "file" : ""

  // Get clean display path (remove sandbox/worktree prefix)
  const displayPath = useMemo(() => {
    if (!filePath) return ""
    const prefixes = [
      "/project/sandbox/repo/",
      "/project/sandbox/",
      "/project/",
    ]
    for (const prefix of prefixes) {
      if (filePath.startsWith(prefix)) {
        return filePath.slice(prefix.length)
      }
    }
    if (filePath.startsWith("/")) {
      const parts = filePath.split("/")
      const rootIndicators = ["apps", "packages", "src", "lib", "components"]
      const rootIndex = parts.findIndex((p: string) => rootIndicators.includes(p))
      if (rootIndex > 0) {
        return parts.slice(rootIndex).join("/")
      }
      // Handle .21st/worktrees paths
      const worktreeIndex = parts.findIndex((p: string) => p === "worktrees")
      if (worktreeIndex > 0 && parts.length > worktreeIndex + 2) {
        return parts.slice(worktreeIndex + 3).join("/") || filePath
      }
    }
    return filePath
  }, [filePath])

  // Handler to open diff sidebar and focus on this file
  const handleOpenInDiff = useCallback(() => {
    if (!displayPath) return
    setDiffSidebarOpen(true)
    setFocusedDiffFile(displayPath)
  }, [displayPath, setDiffSidebarOpen, setFocusedDiffFile])

  // Click handlers
  const handleHeaderClick = useCallback(() => {
    if (!isPending && !isInputStreaming) {
      setIsCollapsed(prev => !prev)
    }
  }, [isPending, isInputStreaming])

  const handleFilenameClick = useCallback((e: React.MouseEvent) => {
    if (displayPath) {
      e.stopPropagation()
      handleOpenInDiff()
    }
  }, [displayPath, handleOpenInDiff])

  const handleExpandButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsCollapsed(prev => !prev)
  }, [])

  const handleContentClick = useCallback(() => {
    // If collapsed, expand on click
    if (isCollapsed && !isPending && !isInputStreaming) {
      setIsCollapsed(false)
    }
  }, [isCollapsed, isPending, isInputStreaming])

  // Get file icon
  const FileIcon = filename ? getFileIconByExtension(filename, true) : null

  // Calculate diff stats
  const diffStats = useMemo(() => {
    if (filediff) {
      return {
        addedLines: filediff.additions || 0,
        removedLines: filediff.deletions || 0,
      }
    }
    if (isWriteMode && writeContent) {
      return {
        addedLines: writeContent.split("\n").length,
        removedLines: 0,
      }
    }
    // Calculate stats from oldString/newString for Edit operations
    if (oldString || newString) {
      const oldLines = oldString ? oldString.split("\n").length : 0
      const newLines = newString ? newString.split("\n").length : 0
      return {
        addedLines: newLines,
        removedLines: oldLines,
      }
    }
    return null
  }, [filediff, isWriteMode, writeContent, oldString, newString])

  // Check if we have content to display
  // Support both filediff (new API) and oldString/newString (input fallback)
  // Note: For Edit operations, we need either old_string or new_string to show a diff
  const hasContent = !!(
    filediff?.before !== undefined || 
    filediff?.after !== undefined || 
    writeContent ||
    oldString ||
    newString
  )

  // Generate unified diff patch for PatchDiff
  // This creates a proper unified diff string from old/new content
  const unifiedPatch = useMemo(() => {
    const oldContent = isWriteMode ? "" : (filediff?.before ?? oldString ?? "")
    const newContent = isWriteMode ? writeContent : (filediff?.after ?? newString ?? "")
    
    // If both are empty or identical, no diff to show
    if (oldContent === newContent) return ""
    
    // Generate unified diff using the 'diff' library
    // Use displayPath for the file name in the diff header
    const patch = createPatch(
      displayPath || filename || "file",
      oldContent,
      newContent,
      "", // oldHeader (optional)
      "", // newHeader (optional)
      { context: 3 } // Show 3 lines of context
    )
    
    return patch
  }, [filediff?.before, filediff?.after, oldString, newString, writeContent, isWriteMode, displayPath, filename])

  // Header title based on mode and state
  const headerAction = useMemo(() => {
    if (isWriteMode) {
      return isInputStreaming ? "Creating" : "Created"
    }
    return isInputStreaming ? "Editing" : "Edited"
  }, [isWriteMode, isInputStreaming])

  // Show minimal view until we have the full file path
  if (!filePath) {
    if (isInterrupted) {
      return <AgentToolInterrupted toolName={isWriteMode ? "Write" : "Edit"} />
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="text-xs text-muted-foreground">
          {isPending ? (
            <TextShimmer as="span" duration={1.2}>
              {headerAction}
            </TextShimmer>
          ) : (
            headerAction
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header */}
      <div
        onClick={hasContent ? handleHeaderClick : undefined}
        className={cn(
          "flex items-center justify-between pl-2.5 pr-2 h-7",
          hasContent && !isPending && !isInputStreaming && "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          {/* Action text: Edited/Created */}
          {isPending || isInputStreaming ? (
            <TextShimmer as="span" duration={1.2} className="text-muted-foreground flex-shrink-0">
              {headerAction}
            </TextShimmer>
          ) : (
            <span className="text-muted-foreground flex-shrink-0">{headerAction}</span>
          )}
          
          {/* File icon and name */}
          <div
            onClick={handleFilenameClick}
            className={cn(
              "flex items-center gap-1.5 truncate min-w-0",
              displayPath && "cursor-pointer hover:text-foreground",
            )}
          >
            {FileIcon && (
              <FileIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-foreground">{filename}</span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="px-2 py-1.5 max-w-none flex items-center justify-center"
              >
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                  {displayPath}
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Diff stats or spinner */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isPending || isInputStreaming ? (
              <IconSpinner className="w-3 h-3" />
            ) : diffStats ? (
              <>
                <span className="text-green-600 dark:text-green-400">
                  +{diffStats.addedLines}
                </span>
                {diffStats.removedLines > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    -{diffStats.removedLines}
                  </span>
                )}
              </>
            ) : null}
          </div>

          {/* Diff mode toggle (split/unified) */}
          {hasContent && !isPending && !isInputStreaming && !isCollapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDiffMode(diffMode === DiffModeEnum.Split ? DiffModeEnum.Unified : DiffModeEnum.Split)
                  }}
                  className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
                >
                  {diffMode === DiffModeEnum.Split ? (
                    <Rows2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {diffMode === DiffModeEnum.Split ? "Unified view" : "Split view"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Expand/Collapse button */}
          {hasContent && !isPending && !isInputStreaming && (
            <button
              onClick={handleExpandButtonClick}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              <div className="relative w-4 h-4">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isCollapsed ? "opacity-100 scale-100" : "opacity-0 scale-75",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isCollapsed ? "opacity-0 scale-75" : "opacity-100 scale-100",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Content - diff view using @pierre/diffs */}
      {hasContent && unifiedPatch && !isCollapsed && (
        <div
          onClick={handleContentClick}
          className="border-t border-border agent-diff-wrapper agent-edit-diff-wrapper"
        >
          <PatchDiff
            patch={unifiedPatch}
            options={{
              theme: getPierreTheme(shikiTheme, !isLight),
              themeType: isLight ? "light" : "dark",
              diffStyle: diffMode === DiffModeEnum.Split ? "split" : "unified",
              diffIndicators: "bars",
              overflow: "scroll",
              disableFileHeader: true,
              expandUnchanged: true,
              // Hide "No newline at end of file" message via CSS injection
              unsafeCSS: "[data-no-newline] { display: none !important; }",
            }}
          />
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
