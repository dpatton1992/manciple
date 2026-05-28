# OpenCode Agents

OpenCode reads `.claude/skills/` automatically via its Claude Code compatibility
layer — no separate `.opencode/skills/` copies are needed.

Two custom agents are defined in `.opencode/agents/`:

## `assignr-worker` (Subagent Mode)

`assignr-worker` implements a single Assignr task end-to-end via MCP. It loads
the task packet, runs the work, verifies, writes a run log, and sets the final
status.

- **Configuration**: `.opencode/agents/assignr-worker.md`
- **Mode**: `subagent` — invoked by the coordinator or directly by the user.
- **Invocation**: Use `@assignr-worker` with a task ID, or ask it to choose one.
- **Workflow**: Calls the `skill` tool with `name: "assignr-mcp-task-runner"` to
  load the runner workflow at runtime. Uses Assignr MCP tools
  (`assignr_get_task_packet`, `assignr_set_status`, `assignr_verify`,
  `assignr_run_log`) as the primary interface.

## `assignr-coordinator` (Primary Mode)

`assignr-coordinator` coordinates multiple Assignr task workers in parallel. It
dispatches a plan, spawns `assignr-worker` subagents for each assignment, and
aggregates results.

- **Configuration**: `.opencode/agents/assignr-coordinator.md`
- **Mode**: `primary` — reachable via the Tab key in OpenCode.
- **Invocation**: Switch to this agent using Tab, or configure it as the startup
  agent.
- **Workflow**: Calls the `skill` tool with `name: "assignr-agents"` to load the
  coordination workflow. Uses `assignr_dispatch_plan` to determine task
  assignments, spawns `assignr-worker` subagents in parallel (up to detected CPU
  core count) via the `task` tool, then runs `assignr_verify` with
  `profile: "coordinator"` after all workers complete.

## MCP Server

The Assignr MCP server is registered in `opencode.json` at the repo root:

```json
{
  "mcp": {
    "assignr": {
      "type": "local",
      "command": ["node", "./bin/assignr-mcp.js"],
      "enabled": true
    }
  }
}
```

Assignr tools are prefixed `assignr_` (e.g. `assignr_get_task_packet`,
`assignr_set_status`, `assignr_verify`). Prefer these over raw CLI calls when
both are available. See [MCP Server](mcp-server.md) for the full tool surface.

## Skills at Runtime

Both agents load their workflow by calling the `skill` tool at runtime:

- `assignr-worker` calls `skill` with `name: "assignr-mcp-task-runner"`.
- `assignr-coordinator` calls `skill` with `name: "assignr-agents"`.

This keeps the agent configuration files concise — they define permissions and
entry point behavior, while the skills provide the detailed workflow steps.

## Project-Level Rules

[`AGENTS.md`](../AGENTS.md) at the repo root provides project-level instructions
for OpenCode sessions:

- **Token audit instructions**: How to run the Assignr token audit script and
  report results deterministically.
- **Agent hints**: Available agents (`@assignr-worker`,
  `assignr-coordinator`) and how to use them.
- **MCP tool conventions**: Which tools to prefer and naming conventions.
- **Project conventions**: Task spec locations, run logs, verification profiles,
  and test/lint commands.

## See Also

- [MCP Server](mcp-server.md): MCP setup and tool surface.
- [Agent Skills](agent-skills.md): Skill files for Assignr workflows across
  different agent platforms.
- [Evidence and Review](evidence-and-review.md): Run logs, review prompts, and
  reviewer decisions.
- [Getting Started](getting-started.md): Human CLI workflow for Assignr.
