# Assignr

Assignr helps developers turn AI coding work into scoped, reviewable, repeatable tasks that live in the repo.

It does not run models.
It does not replace Claude Code, Codex, Cursor, Aider, Goose, or other agent harnesses.

Instead, it sits one layer earlier: helping you break work into constrained, agent-sized tasks, compile them into structured prompts, and track what ran, what changed, what failed, and what needs review — across multiple sessions and tools.

## Why

The bottleneck in AI-assisted development is not only code generation. It is context management, task scope, reviewability, and durable state.

Without a structured workflow:
- Agent tasks are vague and over-scoped
- Results are hard to review
- Context is lost between runs
- Follow-up work is not tracked
- You cannot repeat or audit what ran

Assignr fixes the workflow, not the model.

## Install

```bash
npm install -g @dpatt/assignr
```

Or with pnpm:

```bash
pnpm add -g @dpatt/assignr
```

After installing, verify with:

```bash
assignr --help
```

## What it looks like

**Without Assignr**, you paste something like this into an agent:

> "Add license expiration reminders to the credentialing module"

The agent touches files it should not, drifts out of scope, and you have no record of what it did.

**With Assignr**, the work moves through a visible loop: spec -> compile -> run -> log -> review.

### 1. Task spec YAML

This task spec YAML lives at `.assignr/specs/tasks/license-expiration-reminders.yaml` and gives the agent a realistic feature request with explicit scope, acceptance criteria, and verification.

```yaml
id: license-expiration-reminders
title: License expiration reminders
status: pending
type: implementation
domain: credentialing
priority: high
goal: >
  Add expiration reminder support for provider licenses so users can set
  an expiration date and see expiring licenses in the dashboard.
acceptance_criteria:
  - Users can set an expiration date on a provider license.
  - Expiring licenses (within 30 days) appear in the dashboard with a warning.
  - Expired licenses are visually distinct from active ones.
allowed_paths:
  - src/features/licenses/**
  - src/components/dashboard/**
forbidden_paths:
  - src/auth/**
  - src/billing/**
verification:
  commands:
    - pnpm typecheck
    - pnpm test -- licenses
outputs_required:
  - files_changed
  - tests_run
  - risks
```

### 2. Compiled prompt output

This compiled prompt lives at `.assignr/prompts/generated/license-expiration-reminders.md` after `assignr compile license-expiration-reminders` and is the file you paste into Claude Code, Codex, Cursor, Aider, Goose, or another agent harness.

```markdown
## Domain Context

### Id

credentialing

### Description

Provider credentialing workflows, including license records, expirations,
dashboard warnings, and provider-facing credential status.

### Key Files

- src/features/licenses/
- src/components/dashboard/
- tests/licenses/

# Agent Task: License expiration reminders

## Goal

Add expiration reminder support for provider licenses so users can set
an expiration date and see expiring licenses in the dashboard.

## Scope

### Allowed Paths

- src/features/licenses/**
- src/components/dashboard/**

### Forbidden Paths

- src/auth/**
- src/billing/**

...
```

### 3. Run log stub

This run log lives under `.assignr/runs/license-expiration-reminders/` after `assignr run-log license-expiration-reminders` and is the audit stub the developer fills in when the agent run finishes.

```markdown
# Run Log: License expiration reminders

## Metadata

- Task ID: license-expiration-reminders
- Status: in_progress
- Started: 2026-05-23T14:18:03.000Z
- Agent/Harness: TODO
- Model: TODO
- Branch: feature/license-reminders

## Prompt Used

- Generated prompt path: .assignr/prompts/generated/license-expiration-reminders.md

## Files Changed

TODO: list files changed during this run.

## Commands Run

TODO: list commands run during this run.

## Result

<!-- complete | partial | blocked | failed -->
TODO

## Risks

TODO

## Follow-Up Tasks

TODO
```

### 4. Review prompt output

This review prompt lives at `.assignr/prompts/generated/review-license-expiration-reminders.md` after `assignr review license-expiration-reminders` and asks a reviewer to compare the run log, diff, and task contract before approval.

```markdown
# Review Task: License expiration reminders

You are reviewing an agent-produced change.

Evaluate whether the implementation satisfies the task without creating unnecessary risk.

## Task Metadata

- ID: license-expiration-reminders
- Domain: credentialing
- Status: needs_review

## Task Goal

Add expiration reminder support for provider licenses so users can set
an expiration date and see expiring licenses in the dashboard.

## Run Log

# Run Log: License expiration reminders
...

## Check

- acceptance criteria
- changed files
- forbidden path violations
- tests run
- missing edge cases

## Return

### Verdict

approved | needs_changes | blocked
```

## Usage

```bash
assignr init
assignr new "License expiration reminders" --type implementation --domain credentialing --priority high
assignr validate
assignr compile license-expiration-reminders
# Run the generated prompt in Claude Code, Codex, Cursor, Aider, etc.
assignr run-log license-expiration-reminders
assignr set-status license-expiration-reminders needs_review
assignr review license-expiration-reminders
```

## Folder Structure

After `assignr init`:

```
.assignr/
  config.yaml               # Root config

  specs/
    tasks/                  # Task specs (YAML)
    domains/                # Domain context (placeholder — V1)
    contracts/              # Contract specs (placeholder — V1)

  prompts/
    templates/              # Prompt templates
      implementation.md
      review.md
      test.md
    generated/              # Compiled prompts (git-ignored or tracked)
      <task-id>.md
      review-<task-id>.md

  runs/                     # Run log stubs
    <timestamp>-<task-id>.md

  state/
    tasks.json              # Derived task index

  commands/
    README.md               # Workflow notes
```

## Task Specs

Task specs are YAML files in `.assignr/specs/tasks/`. Each file describes one unit of agent work.

### Required Fields

| Field | Description |
|---|---|
| `id` | Unique slug, no spaces |
| `title` | Human-readable title |
| `status` | `pending`, `in_progress`, `needs_review`, `complete`, `blocked`, `failed`, `partial` |
| `type` | `planning`, `implementation`, `review`, `test`, `refactor`, `docs`, `research`, `hardening` |
| `domain` | Area of the codebase (e.g. `credentialing`, `billing`) |
| `goal` | What this task should accomplish |
| `acceptance_criteria` | List of conditions for completion |
| `verification.commands` | Commands to verify the implementation |

### Optional Fields (warn if missing)

| Field | Description |
|---|---|
| `depends_on` | Task IDs this task depends on |
| `allowed_paths` | Glob patterns — agent may touch these |
| `forbidden_paths` | Glob patterns — agent must not touch these |
| `outputs_required` | What the agent must report |
| `notes` | Constraints or context |

### Example

```yaml
id: license-expiration-reminders
title: License expiration reminders
status: pending
type: implementation
domain: credentialing
priority: high

depends_on:
  - license-data-model

allowed_paths:
  - src/features/licenses/**

forbidden_paths:
  - src/auth/**

goal: >
  Add expiration reminder support for provider licenses.

acceptance_criteria:
  - Users can set an expiration date for a provider license.
  - Expiring licenses are shown in the dashboard.

verification:
  commands:
    - pnpm typecheck
    - pnpm test -- licenses

outputs_required:
  - files_changed
  - tests_run
  - risks

notes:
  - Keep implementation narrow.
```

## Commands

### `assignr init`

Initialize the `.assignr/` folder structure.

```bash
assignr init
assignr init --force        # Overwrite existing files
assignr init --root agent   # Use a custom root directory
```

### `assignr new <title>`

Create a new task spec.

```bash
assignr new "License expiration reminders"
assignr new "License expiration reminders" --type implementation --domain credentialing --priority high
```

### `assignr validate`

Validate all task specs.

```bash
assignr validate
```

### `assignr compile [task-id]`

Compile task specs into markdown prompts ready for an agent.

```bash
assignr compile
assignr compile license-expiration-reminders
assignr compile --status pending
assignr compile --all
```

### `assignr status`

Show a summary of task statuses and suggest the next unblocked task.

```bash
assignr status
```

### `assignr set-status <task-id> <status>`

Update the status of a task.

```bash
assignr set-status license-expiration-reminders needs_review
```

### `assignr run-log <task-id>`

Create a run log stub for a completed or in-progress task.

```bash
assignr run-log license-expiration-reminders
```

### `assignr review <task-id>`

Generate a review prompt for a task.

```bash
assignr review license-expiration-reminders
```

### `assignr doctor`

Check whether the repo is configured correctly.

```bash
assignr doctor
```

### `assignr mcp-config`

Create or update `.mcp.json` for the Assignr MCP server.

```bash
assignr mcp-config
assignr mcp-config --force   # Overwrite an existing "assignr" MCP server entry
```

## MCP Server

Assignr also ships a stdio MCP server so agents can manage tasks with tool calls instead of shelling out to the CLI.

Build the package first:

```bash
pnpm build
```

Then create the MCP config from the repo where Assignr should read and write `.assignr/` state:

```bash
assignr mcp-config
```

This writes a repo-local `.mcp.json` like:

```json
{
  "mcpServers": {
    "assignr": {
      "command": "node",
      "args": ["/path/to/package/bin/assignr-mcp.js"],
      "cwd": "/path/to/repo"
    }
  }
}
```

Restart your agent client after creating or changing `.mcp.json`; MCP tools are usually discovered at session startup.

If your Codex install does not load repo-local `.mcp.json`, add the same server to `~/.codex/config.toml`:

```toml
[mcp_servers.assignr]
command = "node"
args = ["/path/to/package/bin/assignr-mcp.js"]
cwd = "/path/to/repo"
```

After editing `~/.codex/config.toml`, start a fresh Codex session. Existing sessions cannot gain newly configured MCP tools after startup.

The server exposes these tools:

| Tool | Purpose |
|---|---|
| `assignr_list` | List tasks, optionally filtered by status or domain |
| `assignr_validate` | Run schema and semantic validation |
| `assignr_get_task` | Return one parsed task spec |
| `assignr_compile` | Compile one task into a generated prompt |
| `assignr_set_status` | Update a task status in its YAML file |
| `assignr_run_log` | Create a run log stub |
| `assignr_get_compiled_prompt` | Read a compiled prompt |

CLI and MCP behavior should stay aligned. When adding a feature that changes task operations, prefer one shared Assignr spec and shared implementation logic for both surfaces, then keep CLI-specific and MCP-specific specs only for transport details such as terminal formatting, stdio protocol behavior, and MCP JSON error responses.

## Example Workflow

```bash
# 1. Initialize
assignr init

# 2. Create a task
assignr new "License expiration reminders" \
  --type implementation \
  --domain credentialing \
  --priority high

# 3. Fill in the spec
# Edit .assignr/specs/tasks/license-expiration-reminders.yaml

# 4. Validate
assignr validate

# 5. Compile into a prompt
assignr compile license-expiration-reminders
# → .assignr/prompts/generated/license-expiration-reminders.md

# 6. Run the prompt in your preferred agent
# (Claude Code, Codex, Cursor, Aider, Goose, etc.)

# 7. Log the run
assignr run-log license-expiration-reminders
# → .assignr/runs/<timestamp>-license-expiration-reminders.md

# 8. Mark for review
assignr set-status license-expiration-reminders needs_review

# 9. Generate a review prompt
assignr review license-expiration-reminders
# → .assignr/prompts/generated/review-license-expiration-reminders.md

# 10. After review passes
assignr set-status license-expiration-reminders complete
```

## Non-Goals (V0)

Assignr v0 does not:

- Call any AI model
- Run agents
- Execute code autonomously
- Host a web dashboard
- Sync to a cloud service
- Manage auth or billing
- Auto-merge changes
- Integrate with GitHub Apps

These may be added in later versions based on real usage.

## Roadmap

### V0 (current)

- [x] Task spec schema with Zod validation
- [x] `init`, `new`, `validate`, `compile`, `status`, `set-status`, `run-log`, `review`, `doctor`
- [x] Deterministic prompt compilation from templates
- [x] Local file-based state

### V1 (planned)

- [ ] Circular dependency detection
- [ ] Domain specs and context injection
- [ ] `watch` mode for auto-recompile
- [ ] Configurable prompt template directory
- [ ] `list` command with filtering

### V2 (possible)

- [ ] Run log auto-population from git diff
- [ ] Review prompt with actual diff injection
- [ ] Integration with GitHub PRs (read-only)
