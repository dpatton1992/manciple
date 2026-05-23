---
name: assignr-4-agents
description: Coordinate exactly four sub-agents to work through Assignr tasks in parallel, with each worker using the assignr-mcp-task-runner skill and Assignr MCP tools. Use when the user asks to spawn four agents, run four Assignr workers, process multiple Assignr tasks in parallel, or coordinate Assignr task execution across sub-agents.
---

# Assignr 4 Agents

Coordinate exactly four worker agents for Assignr task work. Each worker must use `assignr-mcp-task-runner` as its operating procedure.

Use this skill as the parent coordinator. Do not do the task implementation yourself unless a small coordinator-side change is needed to integrate worker results.

## Required Tools

Use the `Task` tool to spawn workers. If the tool is not available, stop and report that this skill requires sub-agent support.

Use the repo-local `assignr-mcp-task-runner` skill when available:

`/Users/danielpatton/Documents/GitHub/promptops/.claude/skills/assignr-mcp-task-runner/SKILL.md`

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

3. Spawn four agents in parallel using the `Task` tool.
   - Each `Task` call must be fully self-contained — embed all required context directly in the `prompt` parameter. Workers have no access to conversation history.
   - Include in each worker prompt: repo absolute path, skill file path, assigned task id (or sidecar scope), task spec details (acceptance criteria, allowed/forbidden paths, verification commands, outputs required), and any coordinator-side context the worker would otherwise miss.
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
   - Validate Assignr metadata with `assignr_validate` when MCP tools are available.

6. Report the run.
   - Include each worker's assigned task or sidecar responsibility.
   - Include files changed, verification commands and results, final task statuses, blockers, and follow-up work.
   - Explicitly call out any worker that could not complete its task or verify its changes.

## Worker Prompt Template

Use this shape for every worker. Fill in ALL bracketed values before spawning — workers have no access to conversation history.

> **Important:** Every piece of context the worker needs must be present in the prompt text itself.

```text
Use the assignr-mcp-task-runner skill at [ABSOLUTE skill path, e.g. /Users/danielpatton/Documents/GitHub/promptops/.claude/skills/assignr-mcp-task-runner/SKILL.md] for this assignment.

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
2. Worker 2: next-highest implementation task with non-overlapping file ownership.
3. Worker 3: third implementation task, or a bounded sidecar if fewer tasks are available.
4. Worker 4: fourth implementation task, or verification/review/docs sidecar.

When assigning sidecar work, be explicit about the scope: name the files or modules, the verification commands to run, and the expected output in the final report.
