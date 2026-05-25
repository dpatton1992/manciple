# Agent Skills

Skill files for Claude Code and Codex live in `.claude/skills/` and
`.codex/skills/`.

Copy the relevant skill into your own repo when you want agents to follow the
Assignr workflow automatically.

## Available Skills

- `assignr-mcp-task-runner`: pick up, execute, verify, log, and close one task
  through MCP.
- `assignr-agents`: coordinate multiple Assignr task workers in parallel.

The skills delegate routine scheduling and verification decisions to
deterministic Assignr surfaces:

- Coordinators call `assignr_dispatch_plan` or `assignr dispatch-plan` before
  spawning workers, then spawn only the returned assignments.
- Workers start from `assignr_get_task_packet` or `assignr task-packet
  <task-id>`, using full prompt compilation only when domain context is needed.
- Workers and coordinators report receipts from `assignr_verify` or
  `assignr verify --profile worker|coordinator|review`.
- Scoped YAML checks use `assignr_format_task` or `assignr format-task
  <task-id> --check`; the skills do not run routine whole-repo formatting loops.

Use the MCP setup in [MCP Server](mcp-server.md) when the agent should call
Assignr tools directly. Use [Getting Started](getting-started.md) for the
underlying CLI flow those skills automate.
