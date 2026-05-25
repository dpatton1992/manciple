---
name: assignr-agents
description: Coordinate Assignr task-runner workers efficiently across actionable Assignr work, with each worker using the assignr-mcp-task-runner skill and Assignr MCP tools. Use when the user asks to spawn Assignr workers, process multiple Assignr tasks in parallel, or coordinate Assignr task execution across sub-agents.
---

# Assignr Agents

Coordinate worker agents for Assignr task work, using local CPU capacity as a hard ceiling but choosing worker assignments for throughput, low collision risk, and fast feedback. Each worker must use `assignr-mcp-task-runner` as its operating procedure.

Use this skill as the parent coordinator. Do not do the task implementation yourself unless a small coordinator-side change is needed to integrate worker results.

## Required Tools

Use `multi_agent_v1.spawn_agent` to spawn workers. If the tool is not available, stop and report that this skill requires sub-agent support.

Use the repo-local `assignr-mcp-task-runner` skill when available:

`/Users/danielpatton/Documents/GitHub/promptops/.codex/skills/assignr-mcp-task-runner/SKILL.md`

If that path does not exist, use the discovered `assignr-mcp-task-runner` skill path from the active skill list.

## Coordinator Workflow

1. Detect the worker cap.
   - Determine the available cores before spawning workers. Prefer reliable local mechanisms available in the runtime, such as Node `os.availableParallelism()`, `nproc`, or `sysctl -n hw.ncpu`.
   - Use the detected core count only as the maximum safe worker count, not as the target batch size. If no safe core count can be determined, stop and report the blocker instead of guessing.

2. Discover Assignr tasks.
   - Prefer `assignr_list` filtered to active or actionable tasks when MCP tools are available.
   - If the user names task ids, use those exact ids.
   - Treat unblocked `pending` or `in_progress` active tasks as actionable. Treat `needs_review`, `complete`, `blocked`, `failed`, and other terminal or holding states as non-actionable unless the user explicitly assigns review or recovery work.
   - Let the coordinator handle cross-task YAML formatting cleanup as housekeeping before or after worker batches. Do not assign separate workers just to rediscover or normalize task YAML formatting unless the user explicitly asks for that task.

3. Run a dispatch loop until no actionable active tasks remain.
   - At the start of each loop iteration, refresh the active Assignr task list and dependency state.
   - Select unblocked actionable tasks, preferring high-priority tasks whose dependencies appear satisfied.
   - Choose the batch for efficiency, not availability. Favor tasks that are small, independent, high priority, likely to unlock other work, and unlikely to collide on ownership paths.
   - Cap each batch at the smaller of the detected worker cap and the number of efficient non-overlapping assignments. Do not spawn workers just because capacity exists.
   - Prefer fewer workers when extra parallelism would increase merge risk, duplicate setup/test cost, or README/content conflicts more than it improves throughput.
   - Build non-overlapping work packets for the selected tasks.
   - Each worker must have a distinct ownership boundary. Avoid assigning overlapping implementation files.
   - If two actionable tasks require the same ownership boundary, dispatch only one and leave the other for a later loop iteration after refreshing task status.
   - Treat tasks that all primarily edit `README.md` as README-colliding. Dispatch at most one README-colliding task in a batch unless the work packets can be proven to touch separate sections and verification is cheap.
   - Stop when no actionable active tasks remain, or when all active tasks are in `needs_review`, `complete`, `blocked`, `failed`, or another non-actionable terminal/holding state.
   - After the first batch, stop and report instead of starting another batch if all remaining work is either review-held or README-colliding. Name the held task ids and why another batch would be inefficient.

4. Spawn the current batch of `worker` agents in parallel.
   - Use `worker` role. Do NOT use a full-history fork — the two are incompatible. Instead, embed all required context directly in each worker's prompt.
   - When Assignr MCP tools are available, include only the repo absolute path, skill file path, assigned task id, ownership hint, known collision/dependency notes, and minimal coordinator context. Tell the worker to load the full spec with `assignr_get_task` instead of pasting the expanded spec into the prompt.
   - When Assignr MCP tools are unavailable, include the task spec details needed for safe offline execution: acceptance criteria, allowed/forbidden paths, verification commands, outputs required, and relevant coordinator context.
   - Pass the `assignr-mcp-task-runner` skill as a skill item to each worker.
   - Tell workers they are not alone in the codebase.
   - Tell workers not to revert edits made by others.
   - Tell workers to respect `allowed_paths`, `forbidden_paths`, and task spec write rules.
   - Tell workers to use Assignr MCP status transitions themselves for their assigned task.
   - Tell workers to run targeted checks first and suppress noisy test output where possible, for example by using quiet flags, redirecting verbose logs to temporary files, or reporting only failing output. Workers should still preserve enough output to diagnose failures.

5. Continue coordinator work while workers run.
   - Inspect broad repo state, likely conflict zones, or verification setup.
   - Do not duplicate assigned worker implementation.

6. Integrate each completed batch.
   - Wait for all workers in the current batch before refreshing active tasks unless a worker failure blocks the run.
   - Review each worker's final report and changed files.
   - Resolve conflicts only within the relevant task scope.
   - Run targeted integration checks first. Escalate to the broadest feasible verification only after targeted checks pass or when the touched surface warrants it. Suppress noisy output where possible while preserving failure details.
   - Return to the dispatch loop if refreshed active tasks still include actionable unblocked work.
   - Run `assignr check-lifecycle` before final reporting. If MCP support is available, `assignr_check_lifecycle` may be used for the same check, but still verify the local CLI surface when feasible.
   - If lifecycle placement issues are reported, move each misplaced task YAML to the directory matching its `status`: active statuses (`pending`, `in_progress`, `needs_review`, `blocked`, `failed`, `partial`) go to `.assignr/tasks/active`, `complete` goes to `.assignr/tasks/completed`, and `archived` goes to `.assignr/tasks/archived`.
   - When moving misplaced task files, create the destination directory if needed, never overwrite an existing destination file, and report any collision as a blocker instead of deleting either file.
   - Re-run `assignr check-lifecycle` after any lifecycle moves and require it to pass before final reporting unless a collision or invalid status blocks the run.
   - Validate Assignr metadata with `assignr_validate` when MCP tools are available.

7. Report the run.
   - Include each worker's assigned task or sidecar responsibility.
   - Include files changed, verification commands and results, final task statuses, blockers, and follow-up work.
   - Include the lifecycle check result, any task files moved between lifecycle directories, and any lifecycle placement blockers.
   - Explicitly call out any worker that could not complete its task or verify its changes.

## Worker Prompt Template

Use this shape for every worker. Fill in ALL bracketed values before spawning — workers have no access to conversation history.

> **Important:** Workers are spawned with `worker` role, which cannot use a full-history fork. Every piece of context the worker needs must be present in the prompt text itself.

```text
Use the assignr-mcp-task-runner skill at [ABSOLUTE skill path, e.g. /Users/danielpatton/Documents/GitHub/promptops/.codex/skills/assignr-mcp-task-runner/SKILL.md] for this assignment.

Repo root: [ABSOLUTE path to repo root, e.g. /Users/danielpatton/Documents/GitHub/promptops]

You are Worker [NUMBER] of [TOTAL_WORKERS_THIS_BATCH] in an efficiency-selected Assignr batch. The coordinator used CPU capacity as a ceiling, but chose this assignment because it should improve throughput without unnecessary collision risk. You are not alone in the codebase. Do not revert edits made by others; adapt to existing changes and keep your edits narrowly scoped.

Assigned task or responsibility:
[task id — e.g. TASK-042 — or sidecar responsibility — e.g. "verification pass for TASK-040 and TASK-041"]

Ownership boundary:
[list allowed files/modules explicitly, or state read-only verification scope]

Task context:
- MCP tools available: [yes/no]
- If yes: task id is the contract; load the full spec with assignr_get_task before editing. Coordinator notes: [minimal notes only]
- If no: embedded spec summary follows:
  - title: [task title]
  - allowed_paths: [list]
  - forbidden_paths: [list]
  - acceptance_criteria: [list]
  - verification.commands: [list]
  - outputs_required: [list]

Instructions:
- Use Assignr MCP tools as the source of truth.
- If assigned a task id, load it with assignr_get_task to confirm the spec, set it in_progress if needed, compile it when useful, and obey allowed_paths, forbidden_paths, acceptance_criteria, verification.commands, and outputs_required.
- Do not edit files under .assignr/specs/tasks directly. Only status updates through assignr_set_status are allowed.
- Run targeted checks before broad verification. Suppress noisy passing output where possible, but keep enough failure output to diagnose problems.
- Create the Assignr run log and set final task status according to assignr-mcp-task-runner.
- In your final response, report task id, final status, files changed, verification commands and results, risks, blockers, and follow-ups.
```

## Assignment Patterns

Prefer one task per worker:

1. Worker N: assign the highest-priority actionable task whose dependency state is satisfied, whose ownership boundary does not overlap with already-dispatched workers, and whose completion should produce useful feedback quickly.
2. Next worker: assign the next actionable task with a distinct ownership boundary only if parallel execution is likely to be faster than serial execution after setup, testing, review, and integration costs.
3. Later workers: continue until the batch reaches the efficient assignment count, the available CPU/core cap, or runs out of actionable tasks.
4. Later loop iterations: refresh active tasks and repeat dispatch for newly unblocked work.

If task dependencies form a chain, assign the first unblocked task to one worker and use the others for sidecar review or verification rather than racing dependent implementation.

If most remaining tasks edit README or other shared prose, serialize them unless the coordinator has explicit section-level ownership boundaries.

## Stop Conditions

Stop and report instead of forcing completion when:

- The available workers would need to edit the same files in incompatible ways.
- A task's allowed paths do not include files required for implementation.
- Assignr MCP tools are unavailable and the task cannot be safely completed from local files.
- A worker reports failing verification that the coordinator cannot resolve within scope.
- The repo has conflicting human edits in files a worker must modify.
