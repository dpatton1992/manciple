# Assignr

Assignr is a repo-native workflow layer for existing coding agents.

It does not run models.
It does not replace Claude Code, Codex, Cursor, Aider, Goose, or other agent harnesses.

Instead, it helps you package work for them.

Assignr turns structured task specs into scoped, reviewable, agent-ready prompts, then tracks execution state, run logs, risks, and follow-up tasks inside your repo.

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
npm install -g assignr
```

Or with pnpm:

```bash
pnpm add -g assignr
```

After installing, verify with:

```bash
assignr --help
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
    domains/                # Domain context specs
    contracts/              # Contract specs (future)

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
