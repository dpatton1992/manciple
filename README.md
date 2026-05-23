# Assignr

Task management for coding agents. Define work as scoped YAML specs, compile them into agent-ready prompts, track status and run logs in your repo.

- No hosted service. Everything lives in `.assignr/` alongside your code.
- Works with any agent: Claude Code, Codex, Cursor, Aider, Goose, or a plain chat window.
- Gives agents a consistent scope: goals, acceptance criteria, allowed paths, and verification commands.

## Why

Ad-hoc prompts don't scale. Problems with the typical "paste a description into an agent" workflow:

- No record of what was asked, what ran, or what changed.
- Agents drift out of scope without explicit boundaries.
- No way to track work across sessions or hand off between agents.
- Review and verification are informal and easy to skip.

Assignr fixes this by treating agent work like structured tasks: defined upfront, compiled to a prompt, logged after execution, and closed when done.

## Quick Start

Requires Node.js 18+.

```bash
npm install -g @dpatt/assignr
assignr init
assignr new "Build login page" --type implementation --domain core --priority high
assignr compile build-login-page
```

Use `assignr new --interactive` when you want Assignr to collect the title and common task fields through prompts.

The compiled prompt is written to `.assignr/prompts/generated/build-login-page.md`. Paste it into your agent. Afterward:

```bash
assignr run-log build-login-page \
  --result partial \
  --model gpt-5-codex \
  --agent Codex \
  --command "pnpm test -- auth" \
  --command "pnpm build" \
  --risks "Session expiry edge cases still need review."
assignr set-status build-login-page needs_review
assignr review build-login-page
assignr complete build-login-page
```

`assignr review build-login-page` writes a separate review prompt to `.assignr/prompts/generated/review-build-login-page.md`.

## Task Spec

Tasks are YAML files in `.assignr/tasks/active/`:

```yaml
id: build-login-page
title: Build login page
status: pending
type: implementation
domain: core
priority: high
goal: Implement email/password login with session handling.
acceptance_criteria:
  - User can log in with valid credentials.
  - Invalid credentials return a clear error.
allowed_paths:
  - src/features/auth/**
forbidden_paths:
  - src/admin/**
verification:
  commands:
    - pnpm test -- auth
outputs_required:
  - files_changed
  - tests_run
  - risks
```

## Commands

| Command | Purpose |
|---|---|
| `assignr init` | Initialize `.assignr/` in a repo. |
| `assignr new <title>` | Create a task spec. Add `--interactive` to collect the title and task fields through prompts. |
| `assignr validate` | Validate all task specs. |
| `assignr compile [task-id]` | Compile a task into `.assignr/prompts/generated/<task-id>.md`. Use `--all` or `--status <status>` for bulk compile. |
| `assignr list` | List tasks. Filter with `--status` or `--domain`. |
| `assignr status` | Show active status counts, completed lifecycle count, and suggest the next task. |
| `assignr set-status <id> <status>` | Update status: `pending`, `in_progress`, `needs_review`, `complete`, `blocked`, `failed`, `partial`. |
| `assignr run-log <id>` | Create a run log with git-detected files and optional metadata flags. |
| `assignr review <id>` | Generate a separate review prompt at `.assignr/prompts/generated/review-<task-id>.md`. |
| `assignr complete <id>` | Mark complete and move to `.assignr/tasks/completed/`. |
| `assignr doctor` | Check repo configuration. |
| `assignr mcp-config` | Write `.mcp.json` for the Assignr MCP server. |

## MCP Server

For agents that support MCP tools, run `assignr mcp-config` to write a repo-local `.mcp.json`. Restart your agent client to pick up the tools.

| Tool | Purpose |
|---|---|
| `assignr_list` | List tasks. |
| `assignr_get_task` | Read a task spec. |
| `assignr_compile` | Compile a task to a prompt. |
| `assignr_get_compiled_prompt` | Read an existing generated prompt. |
| `assignr_validate` | Validate specs. |
| `assignr_set_status` | Update task status. |
| `assignr_run_log` | Create a run log with the same metadata fields as the CLI. |

## Agent Skills

Pre-built skill files for Claude Code and Codex live in `.claude/skills/` and `.codex/skills/` in this repo. Copy the relevant skill into your own repo to have agents follow the Assignr workflow automatically.

- `assignr-mcp-task-runner` — single agent: pick up, implement, verify, log, and close one task.
- `assignr-4-agents` — coordinator: run four task workers in parallel.

## Package

- npm: `@dpatt/assignr`
- CLI: `assignr`
- MCP: `assignr-mcp`
- License: MIT
