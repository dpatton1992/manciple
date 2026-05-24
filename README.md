# Assignr

Task management for coding agents. Define work as scoped YAML specs, compile them into agent-ready prompts, track status and run logs in your repo.

- No hosted service. Everything lives in `.assignr/` alongside your code.
- Works with any agent: Claude Code, Codex, Cursor, Aider, Goose, or a plain chat window.
- Gives agents a consistent scope: goals, acceptance criteria, allowed paths, and verification commands.

## 30-Second Demo

**Before:** a messy prompt in chat:

> Please clean up the login flow, fix any weird session bugs, update tests if needed, and make sure the auth pages still work.

**After:** Assignr turns it into a task an agent can run and a reviewer can check:

```bash
assignr new "Harden login session flow" --type implementation --domain auth --priority high
assignr compile harden-login-session-flow
```

```yaml
goal: Fix login session refresh and error handling without touching admin auth.
acceptance_criteria:
  - Expired sessions redirect to login with a clear message.
  - Valid sessions stay active after page refresh.
allowed_paths:
  - src/features/auth/**
  - tests/auth/**
verification:
  commands:
    - pnpm test -- auth
outputs_required:
  - files_changed
  - tests_run
  - risks
```

The compiled prompt gives the agent the scope, success criteria, files it may touch, commands to run, and the handoff details reviewers need.

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

Tasks are YAML files organized by lifecycle:

- `.assignr/tasks/active/` - current work and the default context for agents.
- `.assignr/tasks/completed/` - finished work kept for audit history.
- `.assignr/tasks/archived/` - abandoned or deferred work kept out of active context.

New task specs start in `.assignr/tasks/active/`:

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

## Task Lifecycle

New tasks start as active work. After an implementation agent finishes, it should create a run log and move the task to `needs_review`. In Assignr, `needs_review` means the implementation is done enough to review, but the reviewer has not accepted it yet.

```bash
assignr run-log build-login-page \
  --result complete \
  --model gpt-5-codex \
  --agent Codex \
  --command "pnpm test -- auth" \
  --file "src/features/auth/LoginPage.tsx" \
  --risks "No known risks."
assignr set-status build-login-page needs_review
assignr review-check build-login-page
assignr review build-login-page
```

`assignr review-check` checks whether active `needs_review` tasks have the evidence reviewers expect. `assignr review` writes a review prompt that includes the task context, run log evidence, current git diff, checklist items, and a decision section.

Review happens at two levels. Implementation review asks whether the agent satisfied the task's scope, acceptance criteria, verification commands, artifacts, and risk reporting. Integration review asks whether the change fits the repo as a whole, which matters most in multi-agent runs where several individually correct tasks may still need a final combined check.

Record the reviewer decision with one outcome command:

```bash
assignr approve build-login-page
assignr request-changes build-login-page --reason "Add coverage for expired sessions."
assignr block-review build-login-page --reason "Missing run log evidence."
```

`assignr approve` records the outcome, marks the task complete, and moves it to completed history. `assignr request-changes` records the reason and returns the task to `in_progress`. `assignr block-review` records the blocking reason and marks the task `blocked`.

For manual lifecycle cleanup, `complete` also moves a task out of active context:

```bash
assignr complete build-login-page
```

Archive abandoned or deferred work, and reopen it when it should return to active work:

```bash
assignr archive spike-legacy-auth
assignr reopen spike-legacy-auth
```

Use lifecycle-aware listing when you need history:

```bash
assignr list --completed  # completed audit history
assignr list --archived   # archived or deferred work
assignr list --all        # active, completed, and archived tasks
```

For repos created before lifecycle directories, run `assignr migrate-tasks` to move the old flat task structure into `active`, `completed`, and `archived`.

## Commands

| Command | Purpose |
|---|---|
| `assignr init` | Initialize `.assignr/` in a repo. |
| `assignr new <title>` | Create a task spec. Add `--interactive` to collect the title and task fields through prompts. |
| `assignr validate` | Validate all task specs. |
| `assignr compile [task-id]` | Compile a task into `.assignr/prompts/generated/<task-id>.md`. Use `--all` or `--status <status>` for bulk compile. |
| `assignr list` | List active tasks. Use `--completed`, `--archived`, or `--all` for lifecycle history; filter with `--status` or `--domain`. |
| `assignr status` | Show active status counts, completed lifecycle count, and suggest the next task. |
| `assignr set-status <id> <status>` | Update status: `pending`, `in_progress`, `needs_review`, `complete`, `blocked`, `failed`, `partial`. |
| `assignr run-log <id>` | Create a run log with git-detected files and optional metadata flags. |
| `assignr review <id>` | Generate a separate review prompt at `.assignr/prompts/generated/review-<task-id>.md`. |
| `assignr review-check [id]` | Check review readiness evidence for active `needs_review` tasks. |
| `assignr approve <id>` | Record approval for a `needs_review` task, mark it complete, and move it to completed history. |
| `assignr request-changes <id> --reason <text>` | Record requested changes and return a `needs_review` task to `in_progress`. |
| `assignr block-review <id> --reason <text>` | Record a blocking review reason and mark a `needs_review` task `blocked`. |
| `assignr complete <id>` | Mark complete and move to `.assignr/tasks/completed/`. |
| `assignr archive <id>` | Move abandoned or deferred work to `.assignr/tasks/archived/`. |
| `assignr reopen <id>` | Move a completed or archived task back to `.assignr/tasks/active/`. |
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
