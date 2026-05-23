---
name: assignr-mcp-task-runner
description: Complete implementation, docs, test, refactor, review, or hardening work from Assignr task specs using the Assignr MCP server. Use when the user asks Claude Code to run, complete, pick up, execute, or work through an Assignr task in this repo, especially when MCP tools named assignr_list, assignr_get_task, assignr_compile, assignr_set_status, assignr_run_log, assignr_validate, or assignr_get_compiled_prompt are available.
---

# Assignr MCP Task Runner

Use Assignr as the source of truth for task scope. Prefer the MCP tools over shelling out to `assignr` commands whenever they are available.

## Workflow

1. Discover the task.
   - If the user names a task id, call `assignr_get_task` with that id.
   - If the user asks to choose a task, call `assignr_list` and select a reasonable `pending` or `in_progress` task. Prefer unblocked, high-priority tasks whose dependencies appear satisfied.
   - If MCP tools are unavailable, fall back to reading `.assignr/specs/tasks/*.yaml` directly.

2. Start the task.
   - Call `assignr_set_status` with `in_progress` unless the task is already `in_progress`.
   - Call `assignr_compile` for implementation/test/refactor/docs/hardening tasks when a compiled prompt would clarify scope.
   - Read the returned spec and prompt content. Treat `allowed_paths`, `forbidden_paths`, `acceptance_criteria`, `verification.commands`, and `outputs_required` as binding task constraints.

3. Implement the work.
   - Inspect the repo before editing.
   - **Do not edit files under `.assignr/specs/tasks/` directly.** Task specs are the source of truth for scope; they are written by humans and read by agents. The only permitted writes to task spec files are status updates via `assignr_set_status`.
   - `allowed_paths` and `forbidden_paths` in the task spec constrain the *implementation work* (source code, tests, docs). They do not permit editing the `.assignr/` directory.
   - Stay inside `allowed_paths` when present.
   - Do not edit `forbidden_paths` unless the user explicitly overrides the task.
   - Keep changes scoped to the task. If necessary work is outside scope, stop and report it as a follow-up instead of silently expanding the task.

4. Verify.
   - Run the task's `verification.commands`.
   - Also run narrow tests or typechecks that are clearly relevant to files changed.
   - If a verification command is unavailable or fails for a reason outside the task, report the exact command and failure.

5. Finish.
   - Call `assignr_run_log` to create the run log stub after implementation and verification.
   - Call `assignr_validate` before final status updates when task specs may have changed.
   - Set status with `assignr_set_status`:
     - `needs_review` when implementation is complete and verification passes.
     - `blocked` when progress is stopped by missing information, failing prerequisites, or scope conflicts.
     - `partial` when meaningful work landed but acceptance criteria are not complete.
     - `failed` only when the attempted task could not be completed and no useful partial result remains.

## Tool Result Handling

Assignr MCP tool responses return JSON as text content. Parse the text before using it. If a tool result has `isError: true`, treat the JSON `error` as an operational error, not as a crashed server.

For `assignr_compile`, use the returned `content` directly. For `assignr_get_compiled_prompt`, only call it when the task may already have been compiled or when the user specifically asks for the compiled prompt.

## Reporting

In the final response, include:

- task id and final status
- files changed
- verification commands run and whether they passed
- any risks, blockers, or follow-up tasks requested by `outputs_required`

Keep the report concise, but preserve concrete command names and failure details.

## CLI/MCP Parity

When working on Assignr itself, keep CLI and MCP behavior aligned. Prefer shared task-operation logic for features exposed by both surfaces, with thin CLI formatting and MCP JSON result layers. Use separate specs only for transport-specific behavior such as terminal output, stdio protocol handling, and MCP error formatting.
