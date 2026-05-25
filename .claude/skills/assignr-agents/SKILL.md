---
name: assignr-agents
description: Coordinate Assignr task-runner workers across available CPU cores, with each worker using the assignr-mcp-task-runner skill and Assignr MCP tools. Use when the user asks to spawn Assignr workers, process multiple Assignr tasks in parallel, or coordinate Assignr task execution across sub-agents.
---

# Assignr Agents

Coordinate worker agents for Assignr task work, scaling worker count to the local available CPU core count and the amount of actionable Assignr work. Each worker must use `assignr-mcp-task-runner` as its operating procedure.

Use this skill as the parent coordinator. Do not do the task implementation yourself unless a small coordinator-side change is needed to integrate worker results.

## Required Tools

Use the `Task` tool to spawn workers. If the tool is not available, stop and report that this skill requires sub-agent support.

Use the repo-local `assignr-mcp-task-runner` skill when available:

`/Users/danielpatton/Documents/GitHub/promptops/.claude/skills/assignr-mcp-task-runner/SKILL.md`

If that path does not exist, use the discovered `assignr-mcp-task-runner` skill path from the active skill list.

## Coordinator Workflow

1. Detect the worker cap.
   - Determine the available cores before spawning workers. Prefer reliable local mechanisms available in the runtime, such as Node `os.availableParallelism()`, `nproc`, or `sysctl -n hw.ncpu`.
   - Use the detected core count as the maximum worker count. If no safe core count can be determined, stop and report the blocker instead of guessing.

2. Discover Assignr tasks.
   - Prefer `assignr_list` filtered to active or actionable tasks when MCP tools are available.
   - If the user names task ids, use those exact ids.
   - Treat unblocked `pending` or `in_progress` active tasks as actionable. Treat `needs_review`, `complete`, `blocked`, `failed`, and other terminal or holding states as non-actionable unless the user explicitly assigns review or recovery work.

3. Run a dispatch loop until no actionable active tasks remain.
   - At the start of each loop iteration, refresh the active Assignr task list and dependency state.
   - Select unblocked actionable tasks, preferring high-priority tasks whose dependencies appear satisfied.
   - Cap each batch at the smaller of the available CPU core count and the number of actionable tasks. Do not spawn idle workers just to fill the cap.
   - Build non-overlapping work packets for the selected tasks.
   - Each worker must have a distinct ownership boundary. Avoid assigning overlapping implementation files.
   - If two actionable tasks require the same ownership boundary, dispatch only one and leave the other for a later loop iteration after refreshing task status.
   - Stop when no actionable active tasks remain, or when all active tasks are in `needs_review`, `complete`, `blocked`, `failed`, or another non-actionable terminal/holding state.

4. Spawn the current batch of agents in parallel using the `Task` tool.
   - Each `Task` call must be fully self-contained — embed all required context directly in the `prompt` parameter. Workers have no access to conversation history.
   - Include in each worker prompt: repo absolute path, skill file path, assigned task id (or sidecar scope), task spec details (acceptance criteria, allowed/forbidden paths, verification commands, outputs required), and any coordinator-side context the worker would otherwise miss.
   - Tell workers they are not alone in the codebase.
   - Tell workers not to revert edits made by others.
   - Tell workers to respect `allowed_paths`, `forbidden_paths`, and task spec write rules.
   - Tell workers to use Assignr MCP status transitions themselves for their assigned task.

5. Continue coordinator work while workers run.
   - Inspect broad repo state, likely conflict zones, or verification setup.
   - Do not duplicate assigned worker implementation.

6. Integrate each completed batch.
   - Wait for all workers in the current batch before refreshing active tasks unless a worker failure blocks the run.
   - Review each worker's final report and changed files.
   - Resolve conflicts only within the relevant task scope.
   - Run the broadest feasible verification after integration.
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

> **Important:** Every piece of context the worker needs must be present in the prompt text itself.

```text
Use the assignr-mcp-task-runner skill at [ABSOLUTE skill path, e.g. /Users/danielpatton/Documents/GitHub/promptops/.claude/skills/assignr-mcp-task-runner/SKILL.md] for this assignment.

Repo root: [ABSOLUTE path to repo root, e.g. /Users/danielpatton/Documents/GitHub/promptops]

You are Worker [NUMBER] of [TOTAL_WORKERS_THIS_BATCH] in an Assignr run scaled to the coordinator's available CPU core count. You are not alone in the codebase. Do not revert edits made by others; adapt to existing changes and keep your edits narrowly scoped.

Assigned task or responsibility:
[task id — e.g. TASK-042 — or sidecar responsibility — e.g. "verification pass for TASK-040 and TASK-041"]

Ownership boundary:
[list allowed files/modules explicitly, or state read-only verification scope]

Task spec summary (embed key fields from assignr_get_task output so the worker is not blind on startup):
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
- Run the task verification commands plus any narrow relevant tests.
- Create the Assignr run log and set final task status according to assignr-mcp-task-runner.
- In your final response, report task id, final status, files changed, verification commands and results, risks, blockers, and follow-ups.
```

## Assignment Patterns

Prefer one task per worker:

1. Worker N: assign the highest-priority actionable task whose dependency state is satisfied and whose ownership boundary does not overlap with already-dispatched workers.
2. Next worker: assign the next actionable task with a distinct ownership boundary.
3. Later workers: continue until the batch reaches the available CPU/core cap or runs out of actionable tasks.
4. Later loop iterations: refresh active tasks and repeat dispatch for newly unblocked work.

When assigning sidecar work, be explicit about the scope: name the files or modules, the verification commands to run, and the expected output in the final report.
