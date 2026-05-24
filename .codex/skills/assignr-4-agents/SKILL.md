---
name: assignr-4-agents
description: Coordinate exactly four sub-agents to work through Assignr tasks in parallel, with each worker using the assignr-mcp-task-runner skill and Assignr MCP tools. Use when the user asks to spawn four agents, run four Assignr workers, process multiple Assignr tasks in parallel, or coordinate Assignr task execution across sub-agents.
---

# Assignr 4 Agents

Coordinate exactly four worker agents for Assignr task work. Each worker must use `assignr-mcp-task-runner` as its operating procedure.

Use this skill as the parent coordinator. Do not do the task implementation yourself unless a small coordinator-side change is needed to integrate worker results.

## Required Tools

Use `multi_agent_v1.spawn_agent` to spawn workers. If the tool is not available, stop and report that this skill requires sub-agent support.

Use the repo-local `assignr-mcp-task-runner` skill when available:

`/Users/danielpatton/Documents/GitHub/promptops/.codex/skills/assignr-mcp-task-runner/SKILL.md`

If that path does not exist, use the discovered `assignr-mcp-task-runner` skill path from the active skill list.

## Coordinator Workflow

1. Discover Assignr tasks.
   - Prefer `assignr_list` filtered to active or actionable tasks when MCP tools are available.
   - If the user names task ids, use those exact ids.
   - If the user asks to choose, select up to four unblocked `pending` or `in_progress` tasks. Prefer high-priority tasks whose dependencies appear satisfied.

2. Build four non-overlapping work packets.
   - Spawn exactly four workers.
   - Give each worker one task when four actionable tasks exist.
   - If fewer than four implementation tasks are available, use remaining workers for bounded sidecar work: verification, focused review, docs/readme impact, or MCP/CLI parity checks.
   - Each worker must have a distinct ownership boundary. Avoid assigning overlapping implementation files.

3. Spawn four `worker` agents in parallel.
   - Use `worker` role. Do NOT use a full-history fork — the two are incompatible. Instead, embed all required context directly in each worker's prompt.
   - Include in each worker prompt: repo absolute path, skill file path, assigned task id (or sidecar scope), task spec details (acceptance criteria, allowed/forbidden paths, verification commands, outputs required), and any coordinator-side context the worker would otherwise miss.
   - Pass the `assignr-mcp-task-runner` skill as a skill item to each worker.
   - Tell workers they are not alone in the codebase.
   - Tell workers not to revert edits made by others.
   - Tell workers to respect `allowed_paths`, `forbidden_paths`, and task spec write rules.
   - Tell workers to use Assignr MCP status transitions themselves for their assigned task.

4. Continue coordinator work while workers run.
   - Inspect broad repo state, likely conflict zones, or verification setup.
   - Do not duplicate assigned worker implementation.

5. Integrate results.
   - Wait for all four workers before final reporting unless a worker failure blocks the run.
   - Review each worker's final report and changed files.
   - Resolve conflicts only within the relevant task scope.
   - Run the broadest feasible verification after integration.
   - Run `assignr check-lifecycle` before final reporting. If MCP support is available, `assignr_check_lifecycle` may be used for the same check, but still verify the local CLI surface when feasible.
   - If lifecycle placement issues are reported, move each misplaced task YAML to the directory matching its `status`: active statuses (`pending`, `in_progress`, `needs_review`, `blocked`, `failed`, `partial`) go to `.assignr/tasks/active`, `complete` goes to `.assignr/tasks/completed`, and `archived` goes to `.assignr/tasks/archived`.
   - When moving misplaced task files, create the destination directory if needed, never overwrite an existing destination file, and report any collision as a blocker instead of deleting either file.
   - Re-run `assignr check-lifecycle` after any lifecycle moves and require it to pass before final reporting unless a collision or invalid status blocks the run.
   - Validate Assignr metadata with `assignr_validate` when MCP tools are available.

6. Report the run.
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

You are Worker [1-4] in a four-agent Assignr run. You are not alone in the codebase. Do not revert edits made by others; adapt to existing changes and keep your edits narrowly scoped.

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

1. Worker 1: highest-priority implementation task with minimal dependency risk.
2. Worker 2: next independent implementation or test task.
3. Worker 3: docs, review, hardening, or another implementation task with disjoint paths.
4. Worker 4: verification/parity sidecar or another independent task.

If task dependencies form a chain, assign the first unblocked task to one worker and use the others for sidecar review or verification rather than racing dependent implementation.

## Stop Conditions

Stop and report instead of forcing completion when:

- The four workers would need to edit the same files in incompatible ways.
- A task's allowed paths do not include files required for implementation.
- Assignr MCP tools are unavailable and the task cannot be safely completed from local files.
- A worker reports failing verification that the coordinator cannot resolve within scope.
- The repo has conflicting human edits in files a worker must modify.
