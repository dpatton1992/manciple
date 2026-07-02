---
name: manciple-token-auditor
description: Measure Manciple handoff prompt size for a task by running the local token audit script and reporting its deterministic bucket output.
---

# Manciple Token Auditor

Use this skill when the user asks Claude Code to audit, estimate, measure, or compare Manciple prompt token size for a task.

## Workflow

1. Run the local audit script from the repo root:

```sh
node scripts/manciple-token-audit.mjs <task-id>
```

Pass through any supported estimator options the user requests, such as `--budget <tokens>`, `--include-review`, `--include-run-log`, `--include-diff`, or `--include-git-context`.

2. Report the script output. Preserve the measured buckets, total, budget, and risk line from the receipt.

3. Do not manually count tokens or invent estimates. The script delegates to Manciple's deterministic local `token-estimate` command so reports are repeatable and do not require network access.

## Scope Limitation

This audit measures Manciple handoff size only. It does not measure total agent spend from file reads, tool calls, retries, internal reasoning, generated output, or model/provider accounting.
