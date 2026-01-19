"use client"

import { memo, useMemo } from "react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { getToolStatus } from "./agent-tool-registry"
import { areToolPropsEqual } from "./agent-tool-utils"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { cn } from "../../../lib/utils"

interface AgentReadToolProps {
  part: any
  chatStatus?: string
}

export const AgentReadTool = memo(function AgentReadTool({
  part,
  chatStatus,
}: AgentReadToolProps) {
  const { isPending } = getToolStatus(part, chatStatus)

  // Get file path - check both camelCase and snake_case
  const filePath = part.input?.filePath || part.input?.file_path || ""
  
  // Get optional offset/limit params
  const offset = part.input?.offset
  const limit = part.input?.limit
  
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

  // Get file icon
  const FileIcon = filename ? getFileIconByExtension(filename, true) : null

  // Format params string
  const paramsStr = useMemo(() => {
    const params: string[] = []
    if (offset !== undefined) params.push(`offset=${offset}`)
    if (limit !== undefined) params.push(`limit=${limit}`)
    return params.length > 0 ? `(${params.join(", ")})` : ""
  }, [offset, limit])

  // Show minimal view until we have the full file path
  if (!filePath) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="text-xs text-muted-foreground">
          {isPending ? (
            <TextShimmer as="span" duration={1.2}>
              Read
            </TextShimmer>
          ) : (
            "Read"
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - styled like AgentEditTool */}
      <div className="flex items-center justify-between pl-2.5 pr-2 h-7">
        <div className="flex items-center gap-1.5 text-xs truncate flex-1 min-w-0">
          {/* Action text: Read */}
          {isPending ? (
            <TextShimmer as="span" duration={1.2} className="text-muted-foreground flex-shrink-0">
              Read
            </TextShimmer>
          ) : (
            <span className="text-muted-foreground flex-shrink-0">Read</span>
          )}
          
          {/* File icon and name */}
          <div
            className={cn(
              "flex items-center gap-1.5 truncate min-w-0",
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
            {paramsStr && (
              <span className="text-muted-foreground/60 text-xs flex-shrink-0">
                {paramsStr}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}, areToolPropsEqual)
