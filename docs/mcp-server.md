# MCP Server

Assignr includes an MCP server for agents that can call tools directly.

```bash
assignr mcp-config
```

`assignr mcp-config` creates or updates `.mcp.json` for the repo. Restart your
agent client after writing `.mcp.json` so it loads the new server definition.

The MCP binary is `assignr-mcp`.

## Tools

The MCP surface mirrors the core workflow:

| Tool | Purpose |
|---|---|
| `assignr_list` | List tasks. |
| `assignr_get_task` | Read a task spec. |
| `assignr_get_task_packet` | Read compact bounded worker context for one task. |
| `assignr_compile` | Compile a task prompt. |
| `assignr_get_compiled_prompt` | Read an existing generated prompt. |
| `assignr_dispatch_plan` | Build deterministic coordinator assignments, deferrals, stop conditions, and verification commands. |
| `assignr_verify` | Run a deterministic verification profile and return a compact receipt. |
| `assignr_format_task` | Check or format one task YAML file by task id. |
| `assignr_check_lifecycle` | Validate task files live in the lifecycle directory matching their status. |
| `assignr_validate` | Validate task specs. |
| `assignr_set_status` | Update task status. |
| `assignr_run_log` | Create a run log. |

Agent skills use `assignr_dispatch_plan` before spawning workers,
`assignr_get_task_packet` before task edits, and `assignr_verify` for worker,
coordinator, or review receipts. Use `assignr_format_task` with `check_only`
when a task needs scoped YAML formatting evidence.

For the human CLI workflow, see [Getting Started](getting-started.md).
