# Assignr

Structured task management for coding agents.

Assignr stores scoped YAML task specs, generated agent prompts, run logs, and review evidence inside your repo. It gives agents a clear contract: goal, allowed paths, acceptance criteria, verification commands, and the evidence reviewers need afterward.

## Demo

Install the CLI, initialize a repo, create a task, validate the task files, check the queue, and compile an agent prompt:

```bash
npm install -g @dpatt/assignr

assignr init
assignr new "Build login page" --type implementation --domain auth --priority high
assignr validate
assignr status
assignr compile build-login-page
```

The new task lives in `.assignr/tasks/active/build-login-page.yaml`. The compiled prompt is written to `.assignr/prompts/generated/build-login-page.md` and can be pasted into Claude Code, Codex, Cursor, Aider, Goose, or another coding agent.

After the agent runs, record evidence and move the task to review:

```bash
assignr run-log build-login-page \
  --result complete \
  --agent Codex \
  --model gpt-5-codex \
  --command "pnpm test -- auth" \
  --file "src/features/auth/LoginPage.tsx" \
  --risks "No known risks."

assignr set-status build-login-page needs_review
assignr review build-login-page
```

## Install

Requires Node.js 18+.

```bash
npm install -g @dpatt/assignr
assignr --help
```

## What Assignr Creates

```text
.assignr/
  config.yaml
  domains.yaml
  tasks/
    active/
    completed/
    archived/
  prompts/generated/
  runs/
  reviews/
```

Task specs are plain YAML. A compact task usually looks like this:

```yaml
id: build-login-page
title: Build login page
status: pending
type: implementation
domain: auth
priority: high
goal: Implement email/password login with session handling.
acceptance_criteria:
  - User can log in with valid credentials.
  - Invalid credentials return a clear error.
allowed_paths:
  - src/features/auth/**
verification:
  commands:
    - pnpm test -- auth
outputs_required:
  - files_changed
  - tests_run
  - risks
```

## Command Reference

| Command | Purpose |
|---|---|
| `assignr init` | Initialize `.assignr/` in a repo. |
| `assignr new <title>` | Create a task spec. Add `--interactive` to collect common fields through prompts. |
| `assignr validate` | Validate task specs. |
| `assignr compile [task-id]` | Compile task specs into markdown prompts. Supports `--all` and `--status <status>`. |
| `assignr list` | List task specs. Supports lifecycle and status/domain filters. |
| `assignr status` | Show status counts and a suggested next task. |
| `assignr set-status <task-id> <status>` | Update task status. |
| `assignr complete <task-id>` | Mark an active task complete and move it to completed history. |
| `assignr approve <task-id>` | Approve a `needs_review` task and move it to completed history. |
| `assignr request-changes <task-id> --reason <text>` | Return a `needs_review` task to `in_progress` with a review note. |
| `assignr block-review <task-id> --reason <text>` | Mark review blocked with a reason. |
| `assignr archive <task-id>` | Move an active task to archived history. |
| `assignr reopen <task-id>` | Move a completed or archived task back to active work. |
| `assignr check-lifecycle` | Validate that task files are in the directory matching their status. |
| `assignr migrate-tasks` | Migrate legacy flat task files into lifecycle directories. |
| `assignr run-log <task-id>` | Create a run log with commands, files, result, model, agent, and risks. |
| `assignr review <task-id>` | Generate a review prompt for a task. |
| `assignr review-check [task-id]` | Check review readiness evidence for active `needs_review` tasks. |
| `assignr doctor` | Check repo configuration. |
| `assignr mcp-config` | Create or update `.mcp.json` for the Assignr MCP server. |

## MCP Server

Assignr includes an MCP server for agents that can call tools directly.

```bash
assignr mcp-config
```

Restart your agent client after writing `.mcp.json`. The MCP surface mirrors the core workflow:

| Tool | Purpose |
|---|---|
| `assignr_list` | List tasks. |
| `assignr_get_task` | Read a task spec. |
| `assignr_compile` | Compile a task prompt. |
| `assignr_get_compiled_prompt` | Read an existing generated prompt. |
| `assignr_validate` | Validate task specs. |
| `assignr_set_status` | Update task status. |
| `assignr_run_log` | Create a run log. |

## Agent Skills

Skill files for Claude Code and Codex live in `.claude/skills/` and `.codex/skills/`. Copy the relevant skill into your own repo when you want agents to follow the Assignr workflow automatically.

- `assignr-mcp-task-runner`: pick up, execute, verify, log, and close one task through MCP.
- `assignr-agents`: coordinate multiple Assignr task workers in parallel.

## Package

- npm: `@dpatt/assignr`
- CLI: `assignr`
- MCP binary: `assignr-mcp`
- License: MIT
