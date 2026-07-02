# MCP Server

Manciple includes an MCP server for agents that can call tools directly.

```bash
manciple mcp-config
```

`manciple mcp-config` creates or updates `.mcp.json` for the repo. Restart your
agent client after writing `.mcp.json` so it loads the new server definition.

The MCP binary is `manciple-mcp`.

## Tools

The MCP surface mirrors the core workflow:

| Tool | Purpose |
|---|---|
| `manciple_list` | List tasks. |
| `manciple_get_task` | Read a task spec. |
| `manciple_get_task_packet` | Read compact bounded worker context for one task. |
| `manciple_compile` | Compile a task prompt. |
| `manciple_get_compiled_prompt` | Read an existing generated prompt. |
| `manciple_dispatch_plan` | Build deterministic coordinator assignments, deferrals, stop conditions, and verification commands. |
| `manciple_verify` | Run a deterministic verification profile and return a compact receipt. |
| `manciple_format_task` | Check or format one task YAML file by task id. |
| `manciple_check_lifecycle` | Validate task files live in the lifecycle directory matching their status. |
| `manciple_validate` | Validate task specs. |
| `manciple_set_status` | Update task status. |
| `manciple_run_log` | Create a run log. |

Agent skills use `manciple_dispatch_plan` before spawning workers,
`manciple_get_task_packet` before task edits, and `manciple_verify` for worker,
coordinator, or review receipts. Use `manciple_format_task` with `check_only`
when a task needs scoped YAML formatting evidence.

For the human CLI workflow, see [Getting Started](getting-started.md).
