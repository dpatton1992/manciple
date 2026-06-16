# Assignr Project Instructions

This is the `assignr` repo — a task management CLI and MCP server
for structured agent workflows.

## Assignr Token Audits

When asked to audit, estimate, measure, or compare Assignr prompt token size for
a task, run:

```sh
node scripts/assignr-token-audit.mjs <task-id>
```

Pass through requested estimator options such as `--budget <tokens>`,
`--include-review`, `--include-run-log`, `--include-diff`, or
`--include-git-context`. Report the measured buckets, total, budget, and risk
line from the script output.

Do not manually count tokens or replace the script output with agent judgment.
The script measures Assignr handoff size only; it does not measure total agent
spend from file reads, tools, retries, internal reasoning, generated output, or
model/provider accounting.

## Available Agents

- `@assignr-worker` — subagent that implements a single Assignr task end-to-end
  via MCP. Invoke with a task ID or ask it to choose one.
- `assignr-coordinator` — primary agent (Tab-switchable) that dispatches a plan
  and runs multiple `assignr-worker` subagents in parallel.

## MCP Tools

The `assignr` MCP server is configured in `opencode.json`. Assignr tools are
prefixed `assignr_` (e.g. `assignr_get_task_packet`, `assignr_set_status`,
`assignr_verify`). Prefer these over raw CLI calls when both are available.
Assignr MCP is global: pass this repo root as the `repo` argument on MCP calls
so returned task data, run logs, and verification operate on this checkout.

## Project Conventions

- Task specs live in `.assignr/specs/tasks/`. Do not edit them directly — use
  `assignr_set_status` for status changes.
- Run logs are written to `.assignr/runs/` by `assignr_run_log`.
- Verification uses `assignr_verify --profile worker|coordinator|review`.
- Tests: `pnpm test` (vitest). Lint: `pnpm exec tsc --noEmit`.

## Available Skills

<available_skills>
  <skill>
    <name>assignr-review</name>
    <description>Review completed Assignr task work by loading the task packet, checking review readiness with assignr_verify --profile review, evaluating acceptance criteria against run log and git diff evidence, and recording a deterministic verdict (approve/request-changes/block). Use when the user asks Claude Code to review, approve, or give feedback on a completed Assignr task.</description>
    <location>file:///Users/danielpatton/Documents/GitHub/promptops/.claude/skills/assignr-review/SKILL.md</location>
  </skill>
</available_skills>
