---
name: assignr-task-planner
description: Plan and create Assignr task specs from a product brief, feature description, GitHub issue, or engineering goal. Use when the user asks Claude Code to plan, decompose, break down, or create tasks for a feature or goal — especially before any implementation starts.
---

# Assignr Task Planner

Receive a goal or feature description and produce a set of valid, fully-specified Assignr task specs in `.assignr/tasks/active/`. Do not implement the work. Your output is the plan.

## Inputs

The user will provide one of:
- A plain-English feature description or engineering goal
- A GitHub issue or bug report
- A list of requirements or acceptance criteria
- A vague direction ("clean up auth", "add rate limiting")

Ask clarifying questions only when the input is so underspecified that path discovery and decomposition are impossible without them.

## Step 1: Check existing tasks

Before creating anything, call `assignr_list` with no filters (or run `assignr list --all` via CLI if MCP tools are unavailable). Check whether any existing task already covers the same scope or overlapping `allowed_paths`. If overlap exists, report it and ask whether to proceed, skip the duplicate, or update the existing task instead. Do not create duplicate tasks.

## Step 2: Explore the repo

Inspect the codebase before writing any task spec. You need to know:

- Which directories and files are relevant to the goal
- Which directories must not be touched (admin interfaces, unrelated services, generated files, build outputs)
- Which domain label fits — check `.assignr/specs/domains/` if it exists; otherwise infer from directory structure (`auth`, `core`, `api`, `ui`, `infra`, etc.)
- What verification commands exist — check `package.json` scripts, `Makefile`, `justfile`, or test runner config

Do not guess `allowed_paths` or `forbidden_paths`. Derive them from the actual repo structure.

## Step 3: Decompose

Break the goal into the smallest set of independently reviewable tasks. Each task must:

- Be completable in one agent session without coordination with sibling tasks
- Have a clear, testable outcome
- For behavior-changing work, settle product semantics upfront in `implementation_notes`; do not leave runners to invent behavior during execution
- Not overlap `allowed_paths` with sibling tasks unless the overlap is intentional and noted in both tasks' `notes`

Prefer this decomposition order:
1. Research or planning tasks first — when the goal is architecturally significant or the right approach is unclear
2. Implementation tasks — smallest independently deployable units
3. Test tasks — only when testing is genuinely separate work, not folded into implementation
4. Docs tasks last

Wire `depends_on` between tasks where execution order matters. A task should list the IDs of tasks that must reach `needs_review` or `complete` before it can start.

If the goal fits cleanly in one task, create one task. Do not decompose for its own sake.

## Step 4: Create task specs

When MCP tools are available, call `assignr_create` for each task. The tool generates the `id` from the title via slugify and validates the spec before writing it.

```json
{
  "title": "<human-readable title>",
  "type": "<planning|implementation|review|test|refactor|docs|research|hardening>",
  "domain": "<domain label>",
  "priority": "<low|medium|high|critical>",
  "goal": "<one sentence — what is done when this task is complete>",
  "acceptance_criteria": ["<specific, testable criterion>", "..."],
  "implementation_notes": ["<behavior, product, evidence, compatibility, or design constraint the runner must preserve>", "..."],
  "verification_commands": ["<shell command to verify — must be runnable as-is>"],
  "allowed_paths": ["<glob or exact path discovered in Step 2>"],
  "forbidden_paths": ["<glob or exact path>"],
  "depends_on": ["<other-task-id>"],
  "outputs_required": ["files_changed", "tests_run", "risks"],
  "notes": []
}
```

If `assignr_create` returns an error because the id already exists, report the collision and ask whether to skip or choose a different title.

If MCP tools are unavailable, fall back to writing YAML files directly to `.assignr/tasks/active/<task-id>.yaml` using the same fields. Do not use `assignr new` — it stubs required fields.

For behavior-changing tasks, `implementation_notes` should capture any product semantics that are not already explicit in acceptance criteria. When relevant, call out shared receipt or evidence fields, separate test commands from non-test commands, backwards compatibility expectations, and CLI/MCP parity requirements.

## Step 5: Validate

After writing all specs, run `assignr_validate` (or `assignr validate` via CLI). Fix every reported error before finishing. Do not stop at warnings — resolve them or document why they are acceptable.

## Step 6: Report

Report the plan clearly:

- List each created task: id, title, type, priority, and `depends_on` if non-empty
- Note any existing task overlap detected in Step 1 and how it was handled
- Note any decomposition decisions that may need human input (e.g., "split auth and session handling into two tasks — combine if that's too granular")
- Flag any `allowed_paths` entries you are uncertain about
- Confirm validation passed

Do not set any task to `in_progress`. Leave all created tasks as `pending`.
