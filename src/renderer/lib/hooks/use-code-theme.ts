import { useTheme } from "next-themes"
import { useUIStore } from "../../stores"

/**
 * Hook to get the current code theme based on UI theme
 * Returns the appropriate theme ID for light or dark mode
 * 
 * Priority:
 * 1. Full VS Code theme (if selected)
 * 2. Fallback to legacy code-only theme settings
 */
export function useCodeTheme(): string {
  const { resolvedTheme } = useTheme()
  const lightTheme = useUIStore((state) => state.theme.codeThemeLight)
  const darkTheme = useUIStore((state) => state.theme.codeThemeDark)
  const fullTheme = useUIStore((state) => state.fullThemeData)

  // If a full VS Code theme is selected, use its ID for syntax highlighting
  if (fullTheme) {
    return fullTheme.id
  }

  // Fallback to legacy code-only theme selection
  return resolvedTheme === "light" ? lightTheme : darkTheme
}
