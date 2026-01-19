"use client"

import { memo, useMemo } from "react"
import { FolderSearch } from "lucide-react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { getToolStatus } from "./agent-tool-registry"
import { areToolPropsEqual } from "./agent-tool-utils"

interface AgentGlobToolProps {
  part: any
  chatStatus?: string
}

// Utility to get clean display path (remove home/absolute prefix, keep relative)
function getDisplayPath(filePath: string): string {
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
    const rootIndicators = ["apps", "packages", "src", "lib", "components", "features", "main", "renderer"]
    const rootIndex = parts.findIndex((p: string) => rootIndicators.includes(p))
    if (rootIndex > 0) {
      return parts.slice(rootIndex).join("/")
    }
    const worktreeIndex = parts.findIndex(p => p === "worktrees")
    if (worktreeIndex > 0 && parts.length > worktreeIndex + 2) {
      return parts.slice(worktreeIndex + 3).join("/") || filePath
    }
  }
  
  return filePath
}

export const AgentGlobTool = memo(function AgentGlobTool({
  part,
  chatStatus,
}: AgentGlobToolProps) {
  const { isPending } = getToolStatus(part, chatStatus)

  const pattern = part.input?.pattern || ""
  const path = part.input?.path || part.input?.target_directory || part.input?.targetDirectory || ""
  
  // Get result count from output
  const numFiles = part.output?.numFiles || 0
  
  const displayPath = useMemo(() => {
    if (!path) return ""
    return getDisplayPath(path)
  }, [path])

  // Format result suffix
  const resultSuffix = useMemo(() => {
    if (isPending) return ""
    if (numFiles > 0) return `(${numFiles} files)`
    return "(no files)"
  }, [isPending, numFiles])

  // Show minimal view until we have the pattern
  if (!pattern) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="text-xs text-muted-foreground">
          {isPending ? (
            <TextShimmer as="span" duration={1.2}>
              Glob
            </TextShimmer>
          ) : (
            "Glob"
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - styled like AgentReadTool */}
      <div className="flex items-center justify-between pl-2.5 pr-2 h-7">
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          {/* Action text: Glob */}
          {isPending ? (
            <TextShimmer as="span" duration={1.2} className="text-muted-foreground flex-shrink-0">
              Glob
            </TextShimmer>
          ) : (
            <span className="text-muted-foreground flex-shrink-0">Glob</span>
          )}
          
          {/* Folder icon and pattern */}
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <FolderSearch className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-foreground">{pattern}</span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="px-2 py-1.5 max-w-none flex items-center justify-center"
              >
                <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                  {pattern}
                  {displayPath && ` in ${displayPath}`}
                </span>
              </TooltipContent>
            </Tooltip>
            {displayPath && (
              <span className="text-muted-foreground/60 text-xs flex-shrink-0 truncate">
                in {displayPath}
              </span>
            )}
            {resultSuffix && (
              <span className="text-muted-foreground/60 text-xs flex-shrink-0">
                {resultSuffix}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}, areToolPropsEqual)
