# Codex Instructions

## Assignr Token Audits

When a user asks Codex to audit, estimate, measure, or compare Assignr prompt token size for a task, run:

```sh
node scripts/assignr-token-audit.mjs <task-id>
```

Pass through requested estimator options such as `--budget <tokens>`, `--include-review`, `--include-run-log`, `--include-diff`, or `--include-git-context`. Report the measured buckets, total, budget, and risk line from the script output.

Do not manually count tokens or replace the script output with agent judgment. The script measures Assignr handoff size only; it does not measure total agent spend from file reads, tools, retries, internal reasoning, generated output, or model/provider accounting.
