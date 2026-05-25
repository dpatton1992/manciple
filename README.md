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

## What it looks like

The task spec YAML lives in `.assignr/tasks/active/add-api-rate-limit.yaml` and gives the agent a concrete contract for one feature-sized slice.

```yaml
id: add-api-rate-limit
title: Add API rate limiting
status: pending
type: implementation
domain: api
priority: high
goal: Add per-user rate limiting to the public API handler.
acceptance_criteria:
  - Authenticated API requests are limited to 120 requests per minute per user.
  - Rate-limited responses return HTTP 429 with a retry-after value.
  - Existing unauthenticated health checks are not rate limited.
allowed_paths:
  - src/api/**
  - tests/api/**
verification:
  commands:
    - pnpm test -- api-rate-limit
outputs_required:
  - files_changed
  - tests_run
  - risks
```

The compiled prompt is written to `.assignr/prompts/generated/add-api-rate-limit.md` and is the handoff an implementation agent receives.

```markdown
## Domain Context

### Id

api

### Description

Public API request handling, middleware, and endpoint tests.

# Agent Task: Add API rate limiting

## Goal

Add per-user rate limiting to the public API handler.

## Scope

### Allowed Paths

- src/api/**
- tests/api/**

## Acceptance Criteria

- Authenticated API requests are limited to 120 requests per minute per user.
- Rate-limited responses return HTTP 429 with a retry-after value.
- Existing unauthenticated health checks are not rate limited.

...
```

The run log stub lives in `.assignr/runs/add-api-rate-limit-2026-05-25.md` and captures the evidence the developer fills in after the agent run.

```markdown
# Run Log: add-api-rate-limit

- Result: complete
- Agent: Codex
- Model: gpt-5-codex
- Commands run:
  - pnpm test -- api-rate-limit
- Files changed:
  - src/api/middleware/rateLimit.ts
  - src/api/handler.ts
  - tests/api/rateLimit.test.ts
- Risks:
  - In-memory limiter is suitable for one process; distributed deployments need shared storage.
```

The review prompt is written to `.assignr/prompts/generated/review-add-api-rate-limit.md` and gives a reviewer the task contract, evidence, and checks to verify.

```markdown
# Review Task: add-api-rate-limit

## Review Inputs

- Task spec: `.assignr/tasks/active/add-api-rate-limit.yaml`
- Run log: `.assignr/runs/add-api-rate-limit-2026-05-25.md`
- Changed files:
  - src/api/middleware/rateLimit.ts
  - src/api/handler.ts
  - tests/api/rateLimit.test.ts

## Acceptance Criteria To Check

- Authenticated API requests are limited to 120 requests per minute per user.
- Rate-limited responses return HTTP 429 with a retry-after value.
- Existing unauthenticated health checks are not rate limited.

## Reviewer Instructions

Check the diff, confirm the recorded verification passed, and call out any
scope violations, missing evidence, or residual deployment risk.
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
    active/      # default agent context for pending and in-progress work
    completed/   # audit history for accepted or finished work
    archived/    # audit history for abandoned or superseded work
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

## Task Lifecycle

New tasks start in `.assignr/tasks/active`, which is the default context agents use when listing, compiling, and choosing work. `.assignr/tasks/completed` and `.assignr/tasks/archived` are kept as audit history instead of active queue noise; use list flags when you need to inspect them.

```bash
assignr complete build-login-page
assignr archive replace-legacy-router
assignr reopen replace-legacy-router

assignr list --completed  # show completed history
assignr list --archived   # show archived history
assignr list --all        # show active, completed, and archived tasks
```

Repos that still have the old flat task layout can run `assignr migrate-tasks` to move task files into the lifecycle directories.

## Evidence-Based Review

`needs_review` means implementation work is finished enough for an independent
reviewer to judge it from evidence instead of conversation. The task stays in
the active queue, but it should have a run log that names the agent, commands
run, files changed, result, and known risks.

The expected flow is:

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
assignr review-check build-login-page
```

`assignr review` generates a reviewer prompt with the task context, latest run
log evidence, git diff, checklist items, and a decision section. `assignr
review-check` is the quick readiness gate: it helps catch missing evidence,
unrecorded verification, and scope concerns before someone spends attention on a
deep review.

Reviewer decisions are recorded through the lifecycle commands:

```bash
assignr approve build-login-page
assignr request-changes build-login-page --reason "Missing password-reset test evidence."
assignr block-review build-login-page --reason "Depends on unresolved auth migration."
```

Implementation review asks whether one task satisfied its acceptance criteria
inside its allowed paths. Integration review asks whether several accepted
tasks still work together in the repo. In multi-agent runs, each worker should
leave implementation evidence on its own task; the coordinator or reviewer can
then use integration review for cross-task conflicts, shared behavior, and final
batch confidence.

## Command Reference

| Command | Purpose |
|---|---|
| `assignr init` | Initialize `.assignr/` in a repo. |
| `assignr new <title>` | Create a task spec. Add `--interactive` to collect common fields through prompts. |
| `assignr validate` | Validate task specs. |
| `assignr compile [task-id]` | Compile implementation prompts to `.assignr/prompts/generated/<task-id>.md`. Supports `--all` and `--status <status>`. |
| `assignr list` | List active task specs by default. Add `--completed`, `--archived`, or `--all` for lifecycle history. |
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

`assignr review-queue` is a review-spend control workflow for batches of
`needs_review` tasks. Its value is not lowest raw token cost; it buys
repeatability, auditability, resumability, and safer coordination by preserving
the evidence behind every routing decision. Cheap review means spending the
lightweight deterministic pass first, then reserving deeper review for tasks
whose evidence is risky or incomplete.

Start with triage:

```bash
assignr review-queue --mode triage
```

Triage reads each active `needs_review` task, its latest run log, verification
evidence, changed files, readiness score, dependency state, and obvious scope
problems such as files outside `allowed_paths` or inside `forbidden_paths`. It
prints one row per task:

```text
pass      build-login-page   deterministic=pass
escalate  auth-migration     missing-evidence: Run log is missing expected verification command(s): pnpm test.
blocked   billing-worker     blocked-dependency: Dependency add-billing-schema is not complete.
```

Interpret those outcomes narrowly. `pass` means the recorded evidence is complete
enough for normal reviewer approval flow. `escalate` means a human or deeper
model review should inspect the unresolved evidence before approval. `blocked`
means review would be wasteful until lifecycle, dependency, or loading problems
are fixed.

Then escalate only the risky work:

```bash
assignr review-queue --mode deep --deep-only risky
```

Deep mode generates review prompts for escalated tasks and includes a compact
packet with the task id, status, changed-file count, path summary, test evidence,
acceptance coverage, risk flags, and one reviewer question. Add `--budget
<tokens>` to cap the estimated packet budget for a queue run. The budget is a
simple planning estimate, not provider-specific token accounting.

| Approach | Cost | Coordination Risk | Evidence Durability | Manual Tracking |
|---|---|---|---|---|
| Direct prompt review | Highest per task when used for everything | Easy to lose context across several tasks | Depends on the chat transcript | Reviewer must remember queue state |
| Triage review queue | Low first pass; spends attention on evidence gaps | Safer for batches because every row has a reason | Durable run logs and queue output | Queue output shows pass, escalate, and blocked work |
| Deep review queue | Higher, reserved for risky ambiguity | Focused on the tasks that need judgment | Review prompt plus compact packet | Reviewer follows the packet question and evidence |

The review queue composes existing commands rather than replacing them.
`assignr review-check` remains the source of readiness scoring and evidence
checklist semantics. `assignr coordinator` remains the source of owner queue
grouping, dependency usability, and path-conflict placement.

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
