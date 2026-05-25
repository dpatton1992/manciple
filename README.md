# Assignr

Structured task management for coding agents.

Assignr stores scoped YAML task specs, generated agent prompts, run logs, and review evidence inside your repo. It gives agents a clear contract: goal, allowed paths, acceptance criteria, verification commands, and the evidence reviewers need afterward.

## Demo

Before Assignr, agent handoffs often start as a useful but risky blob:

> Can you clean up login? The errors are confusing, the tests are flaky, and
> support says password reset broke after the session refactor. Please fix what
> you find and make sure auth still works.

After Assignr, that work becomes one scoped task an agent can run and a reviewer
can check in about 30 seconds:

```bash
assignr new "Fix password reset session handling" --type implementation --domain auth --priority high
assignr compile fix-password-reset-session-handling
```

```yaml
goal: Fix password reset failures caused by the session refactor.
acceptance_criteria:
  - Expired reset links show a clear error.
  - Valid reset links create a fresh session.
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
| `assignr compile [task-id]` | Compile implementation prompts to `.assignr/prompts/generated/<task-id>.md`. Supports `--all` and `--status <status>`. |
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
| `assignr review <task-id>` | Generate a separate review prompt at `.assignr/prompts/generated/review-<task-id>.md`. |
| `assignr review-check [task-id]` | Check review readiness evidence for active `needs_review` tasks. |
| `assignr doctor` | Check repo configuration. |
| `assignr mcp-config` | Create or update `.mcp.json` for the Assignr MCP server. |

## Review Queue Mode Contract

`assignr review-queue` is a planned review-spend control workflow for batches of
`needs_review` tasks. It should make reviews repeatable, auditable, resumable,
and safer by preserving durable evidence and escalating only the tasks that need
deeper review. This mode is not a promise to be cheaper than a direct single
prompt; it is a way to avoid spending deep-review effort when recorded evidence
is already complete enough for a reliable routing decision.

Triage mode is the default lightweight pass. For each task, it reads the task
status, task spec, latest run-log evidence, files changed from the run log or git
status, verification commands and recorded results, and any obvious scope
violations such as files outside `allowed_paths` or changes touching
`forbidden_paths`. Its output is a durable queue receipt: task id, triage
decision, readiness score from `review-check`, missing or failed evidence,
changed-file source, scope warnings, documented risks, and the recommended next
action (`approve-ready`, `deep-review`, `request-changes`, or `blocked`).

Deep mode is the expensive confidence pass. It is entered explicitly or by
escalation from triage when any of these signals appear: missing run-log evidence,
failed or unrecorded verification, changed files outside `allowed_paths`,
documented residual risks, path conflicts with active work, incomplete acceptance
criteria evidence, missing required output fields, or a queue placement that the
coordinator marks as rework-needed rather than ready for owner review. Deep mode
uses the full task spec, run log, diff, acceptance criteria, risks, and generated
review prompt to produce a review recommendation with cited evidence.

The review queue should compose existing commands rather than duplicate them.
`assignr review-check` remains the source of readiness scoring and evidence
checklist semantics. `assignr coordinator` remains the source of owner queue
grouping, dependency usability, and path-conflict placement. Review queue mode
joins those signals with durable triage/deep review receipts so a reviewer can
resume a batch and audit why each task did or did not receive deep review.

Planned CLI examples:

```bash
# Triage every active needs_review task and write durable queue receipts.
assignr review-queue --mode triage

# Run a deep review for one task, regardless of triage state.
assignr review-queue --mode deep build-login-page

# Triage the queue first, then run deep review only for escalated tasks.
assignr review-queue --mode triage --escalate deep
```

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
