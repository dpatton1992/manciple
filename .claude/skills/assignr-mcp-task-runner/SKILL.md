---
name: assignr-mcp-task-runner
description: Complete Assignr task work using the Assignr MCP server, optionally focused on implementation, docs, test, refactor, review, or hardening work; default to any of those task types when no focus is given. Use when the user asks Claude Code to run, complete, pick up, execute, or work through an Assignr task in this repo, especially when MCP tools named assignr_get_task_packet, assignr_verify, assignr_format_task, assignr_set_status, or assignr_run_log are available.
---

# Assignr MCP Task Runner

Use Assignr as the source of truth for task scope. Prefer deterministic MCP tools over model-selected local command sequences whenever they are available.

## Optional Focus

The caller may provide `focus: implementation`, `docs`, `test`, `refactor`, `review`, `hardening`, or `any`. For a named task id, run that exact task even if its type differs from the focus. For "choose a task" requests, use `assignr_dispatch_plan` or `assignr dispatch-plan` and select only a returned assignment matching the requested focus.

Once a task is selected, obey the task spec exactly. Do not expand or shrink `allowed_paths`, `forbidden_paths`, acceptance criteria, verification, or outputs because of the focus.

## Workflow

1. Discover compact task context.
   - If the user names a task id, call `assignr_get_task_packet` first. If MCP is unavailable, run `assignr task-packet <task-id>`.
   - If asked to choose a task, use `assignr_dispatch_plan` first, then load the packet for one returned assignment.
   - Use the packet fields as the default worker context: status, dependencies, allowed and forbidden paths, path ownership warnings, acceptance criteria, verification commands, outputs required, and notes.
   - Call `assignr_get_task` only when you need the full YAML shape. Call `assignr_compile` only when the compact packet is insufficient and explicit domain context or full prompt prose is needed.

2. Start the task.
   - Call `assignr_set_status` with `in_progress` unless the packet already reports `in_progress`.
   - Treat `allowed_paths`, `forbidden_paths`, `acceptance_criteria`, `verification_commands`, and `outputs_required` as binding constraints.

3. Implement the work.
   - Inspect the repo before editing.
   - Do not edit files under `.assignr/specs/tasks/` directly. Task status updates must go through `assignr_set_status`.
   - Stay inside `allowed_paths` when present. Do not edit `forbidden_paths` unless the user explicitly overrides the task.
   - Keep changes scoped to the task. If required work is outside scope, stop and report it as a follow-up instead of silently expanding the task.

4. Verify.
   - Prefer `assignr_verify` with profile `worker` when MCP tools are available, or `assignr verify --profile worker` from the CLI. Report the returned receipt.
   - Do not replace the worker profile with a hand-picked suite of local tests. Run additional targeted checks only when they are directly relevant to files changed or needed to diagnose a failure.
   - Use `assignr_format_task` with `check_only: true` or `assignr format-task <task-id> --check` only when scoped task YAML formatting evidence is needed. Do not run routine whole-repo YAML formatting loops during worker completion.

5. Finish.
   - Call `assignr_run_log` after implementation and verification. Include files changed, commands or verify receipt, result, notes, and residual risks.
   - Call `assignr_validate` before final status updates when task specs may have changed or the assignment requests metadata validation.
   - Set status with `assignr_set_status`:
     - `needs_review` when implementation is complete and verification passes.
     - `blocked` when progress is stopped by missing information, failing prerequisites, or scope conflicts.
     - `partial` when meaningful work landed but acceptance criteria are not complete.
     - `failed` only when the attempted task could not be completed and no useful partial result remains.

## Tool Result Handling

Assignr MCP tool responses return JSON as text content. Parse the text before using it. If a tool result has `isError: true`, treat the JSON `error` as an operational error, not as a crashed server.

Use `assignr_compile` content directly only after deciding full prompt context is necessary. Use `assignr_get_compiled_prompt` only when a generated prompt may already exist or the user specifically asks for it.

## Reporting

In the final response, include:

- task id and final status
- files changed
- verification receipt or commands run and whether they passed
- risks, blockers, and follow-up tasks requested by `outputs_required`

Keep the report concise, but preserve concrete command names and failure details.

## CLI/MCP Parity

When working on Assignr itself, keep CLI and MCP behavior aligned. Prefer shared task-operation logic for features exposed by both surfaces, with thin CLI formatting and MCP JSON result layers. Use separate specs only for transport-specific behavior such as terminal output, stdio protocol handling, and MCP error formatting.
