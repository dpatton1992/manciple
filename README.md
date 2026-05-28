# Assignr

Structured task management for coding agents.

Assignr stores scoped YAML task specs, generated agent prompts, run logs, and
review evidence inside your repo. It gives agents a clear contract: goal,
allowed paths, acceptance criteria, verification commands, and the evidence
reviewers need afterward.

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

## Install

Requires Node.js 18+.

```bash
npm install -g @dpatt/assignr
assignr --help
```

## Quickstart

Initialize a repo, create a task, validate it, check the queue, and compile an
agent prompt:

```bash
assignr init
assignr new "Build login page" --type implementation --domain auth --priority high
assignr validate
assignr status
assignr compile build-login-page
```

The new task lives in `.assignr/tasks/active/build-login-page.yaml`. The
compiled prompt is written to
`.assignr/prompts/generated/build-login-page.md` and can be pasted into Claude
Code, Codex, Cursor, Aider, Goose, or another coding agent.

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

For a more detailed first-run walkthrough, see
[Getting Started](docs/getting-started.md).

## What Assignr Creates

```text
.assignr/
  config.yaml
  domains.yaml
  tasks/
    active/      # pending, in-progress, blocked, and needs-review work
    completed/   # accepted or finished task history
    archived/    # abandoned or superseded task history
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
| `assignr compile [task-id]` | Compile an implementation prompt. |
| `assignr list` | List active task specs. |
| `assignr status` | Show status counts and a suggested next task. |
| `assignr run-log <task-id>` | Create a run log with commands, files, result, model, agent, and risks. |
| `assignr set-status <task-id> <status>` | Update task status. |
| `assignr review <task-id>` | Generate a reviewer prompt. |
| `assignr review-check [task-id]` | Check review readiness evidence. |
| `assignr doctor` | Check repo configuration. |
| `assignr mcp-config` | Create or update `.mcp.json` for the Assignr MCP server. |

## Deeper Docs

- [Getting Started](docs/getting-started.md): a fuller first-run workflow.
- [Task Lifecycle](docs/task-lifecycle.md): active, completed, archived, and
  migration behavior.
- [Parallel Workflows](docs/parallel-workflows.md): dependencies, path
  ownership, worktrees, and coordinator loops.
- [Evidence and Review](docs/evidence-and-review.md): run logs, review prompts,
  review checks, and reviewer decisions.
- [Review Queue](docs/review-queue.md): triage and deep-review workflows for
  batches of `needs_review` tasks.
- [MCP Server](docs/mcp-server.md): MCP setup and tool surface.
- [OpenCode Agents](docs/opencode-agents.md): assignr-worker and
  assignr-coordinator agents for OpenCode.
- [Agent Skills](docs/agent-skills.md): Claude Code and Codex skill files for
  Assignr workflows.

## Package

- npm: `@dpatt/assignr`
- CLI: `assignr`
- MCP binary: `assignr-mcp`
- License: MIT
