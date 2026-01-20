# ZeroCode

A GUI wrapper for [OpenCode](https://opencode.ai).

> **Note:** Currently tested on macOS and Linux. Windows support is experimental and may have issues.

## Features

- **Plan & Agent Modes** - Read-only analysis or full code execution permissions
- **Project Management** - Link local folders with automatic Git remote detection
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen
- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Integrated Terminal** - Full terminal access within the app
- **Change Tracking** - Visual diffs and PR management

## Prerequisites

You need to have `opencode` installed globally:

```bash
bun install -g opencode-ai
```

## Installation

### Build from source

```bash
# Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)
bun install
bun run build
bun run package:mac  # or package:win, package:linux
```

## Development

```bash
bun install
bun run dev
```

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
