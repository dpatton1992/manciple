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
| `assignr_compile` | Compile a task prompt. |
| `assignr_get_compiled_prompt` | Read an existing generated prompt. |
| `assignr_validate` | Validate task specs. |
| `assignr_set_status` | Update task status. |
| `assignr_run_log` | Create a run log. |

For the human CLI workflow, see [Getting Started](getting-started.md).
