---
name: assignr-review
description: Review completed Assignr task work by loading the task packet, checking review readiness with assignr_verify --profile review, evaluating acceptance criteria against run log and git diff evidence, and recording a deterministic verdict (approve/request-changes/block). Use when the user asks Claude Code to review, approve, or give feedback on a completed Assignr task.
---

# Assignr Review

Use this skill when reviewing a completed Assignr task. The reviewer evaluates whether the implementation satisfies the task spec, records evidence, and decides a verdict.

This is a review-only workflow. Do not implement changes, fix bugs, or expand scope. If the review uncovers issues, record them and let the implementor handle them.

## Required Tools

Bind the review to the current repository before using tools. Start every
review by resolving the repo root with:

```sh
git rev-parse --show-toplevel
```

The expected Assignr state is the `.assignr/` directory under that repo root.
Pass that root as the `repo` argument on every Assignr MCP call. Assignr MCP is
global; it must return data scoped to the requested `repo`, not to the server
process working directory.

Prefer deterministic MCP tool results over agent judgment. Use repo-local CLI
commands only when MCP tools are unavailable.

- `assignr_get_task_packet <task-id>` — load compact task context
- `assignr_verify --profile review` — run deterministic review checks
- `assignr_verify --profile worker` — re-run worker verification if needed
- `assignr_run_log` — record the review outcome
- `assignr_set_status` — update task status after the review
- `assignr_get_task <task-id>` — load full YAML spec when the packet is insufficient

Use these CLI commands for verdict recording when MCP tools are unavailable:
- `assignr approve <task-id>`
- `assignr request-changes <task-id>`
- `assignr block-review <task-id>`

When using CLI fallback, run commands from the resolved repo root and prefer
`pnpm exec assignr ...` so the local Assignr implementation is used.

## Review Workflow

### Step 1: Load the task

Resolve the current repo root and verify that `.assignr/` exists there. Pass
that absolute root as `repo` on every Assignr MCP call.

Identify the task to review. If the user did not name a task, list tasks in `needs_review` status:

```sh
pnpm exec assignr list --status needs_review
```

When no specific task is named, review every reviewable `needs_review` task by default. Sort the queue by the timestamp of each task's latest non-review-outcome run log under `.assignr/runs/`, oldest first, so the task completed least recently is reviewed first. If a `needs_review` task has no run log, treat it as not review-ready and record/request changes for missing evidence rather than silently skipping it.

Call `assignr_get_task_packet` with `{ "repo": "<repo-root>", "task_id":
"<task-id>" }` to get the compact task context. Review the packet fields:
status, type, goal, acceptance criteria, implementation notes, verification
commands, outputs required, and notes.

If the packet status is not `needs_review`, stop and report the mismatch. Do not review a task that has not been submitted for review.

### Step 2: Check review readiness

Run the deterministic review verification:

```sh
assignr_verify --profile review
```
or via CLI:
```sh
pnpm exec assignr verify --profile review
```

Check that the task has a run log entry. If one does not exist, check with:
```sh
pnpm exec assignr list --status needs_review --domain <domain>
```

If review readiness checks fail (e.g., missing run log, incomplete verification), record the issues and set status to `blocked` or `request-changes` depending on severity.

### Step 3: Load review evidence

Load the run log to see what the worker did:

Run logs are Markdown files under `.assignr/runs/`, usually named with a timestamp prefix such as `.assignr/runs/<timestamp>-<task-id>.md`. Use the latest non-review-outcome run log for implementation evidence, and use `*-review-outcome.md` files only as prior review history.

Inspect the git diff to see what changed:
```sh
git diff <base-ref>...HEAD -- <allowed_paths>
```

Check that only `allowed_paths` were modified and no `forbidden_paths` were touched. Verify that the changes match the task scope.

### Step 4: Evaluate acceptance criteria

Walk through each acceptance criterion from the task spec. For each criterion:

1. State the criterion verbatim.
2. Check the evidence: run log entries, git diff, verification results, file contents.
3. Determine pass/fail/not-applicable.

Use `assignr_get_task` with the same `repo` argument to get the full spec if the
packet is insufficient. If MCP is unavailable, use `pnpm exec assignr
task-packet <task-id>` or read only the repo-local task YAML needed for review
context.

If the implementation notes mention specific constraints, verify those were respected.

### Step 5: Decide a verdict

Choose one of:

| Verdict | Condition | Next status |
|---------|-----------|-------------|
| **Approve** | All acceptance criteria pass. Verification passes. No issues found. | `complete` |
| **Request changes** | Some acceptance criteria fail or issues are found. The work is partially correct but needs fixes. | `needs_review` (after fixes) or stay `needs_review` |
| **Block** | The task cannot proceed: wrong scope, missing dependencies, fundamental approach errors, or review readiness checks failed. | `blocked` |

When in doubt between request-changes and block, prefer request-changes unless the task is fundamentally unsalvageable.

### Step 6: Record the review outcome

Record the review by calling `assignr_run_log` with:

- `task_id`: the reviewed task
- `repo`: the resolved repo root
- `task_status`: the new status after the review
- `result`: one of `complete`, `partial`, `blocked`, or `failed`
- `acceptance_criteria_evidence`: list of evidence lines showing how each criterion passed or failed
- `follow_ups`: any issues found that need addressing
- `risks`: residual concerns
- `verify_receipt`: the receipt from `assignr_verify --profile review`
- `notes`: review notes and verdict rationale

If MCP is unavailable, record the verdict via repo-local CLI:
```sh
pnpm exec assignr approve <task-id>
# or
pnpm exec assignr request-changes <task-id>
# or
pnpm exec assignr block-review <task-id>
```

Set the final task status with `assignr_set_status`, passing the same `repo`:
- `complete` when approved
- `blocked` when blocked
- Leave as `needs_review` when changes are requested (the implementor will re-submit)

### Step 7: Report

In your final response, include:

- task id and title reviewed
- verdict (approve / request-changes / block)
- acceptance criteria results: pass/fail per criterion
- verification receipt from `assignr_verify --profile review` or
  `pnpm exec assignr verify --profile review`
- files changed (from git diff)
- follow-up tasks or issues identified
- risks

Keep the report concise but preserve specific evidence references.

## Verdict Decision Trees

### Approve

All of:
- [ ] Task status is `needs_review`
- [ ] `assignr_verify --profile review` or
      `pnpm exec assignr verify --profile review` passes
- [ ] All acceptance criteria are satisfied
- [ ] Changes are scoped to `allowed_paths`
- [ ] No `forbidden_paths` were modified
- [ ] Run log exists and is complete
- [ ] No residual risks that block shipping

### Request Changes

Any of:
- [ ] One or more acceptance criteria not met
- [ ] Verification fails
- [ ] Run log missing key evidence (files_changed, tests_run, verify_receipt)
- [ ] Changes touch unexpected areas
- [ ] Implementation notes not followed

### Block

Any of:
- [ ] Task is not in `needs_review` status
- [ ] Missing dependent tasks that must complete first
- [ ] Fundamental approach is wrong — the task needs re-specification
- [ ] Changes are destructive or outside the allowed scope
- [ ] Review readiness checks fail critically

## Scope Boundaries

This skill is for reviewing Assignr task work only. Do not:
- Edit task specs directly (use `assignr_set_status` for status)
- Implement fixes or improvements found during review
- Review tasks not in `needs_review` status
- Expand the scope of the review beyond the task spec

If you encounter issues outside the task scope, report them as follow-ups.
