# Agent Skills

Skill files for Claude Code and Codex live in `.claude/skills/` and
`.codex/skills/`.

Copy the relevant skill into your own repo when you want agents to follow the
Assignr workflow automatically.

## Available Skills

- `assignr-mcp-task-runner`: pick up, execute, verify, log, and close one task
  through MCP.
- `assignr-agents`: coordinate multiple Assignr task workers in parallel.

Use the MCP setup in [MCP Server](mcp-server.md) when the agent should call
Assignr tools directly. Use [Getting Started](getting-started.md) for the
underlying CLI flow those skills automate.
