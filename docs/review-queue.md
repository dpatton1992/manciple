# Review Queue

`manciple review-queue` is a review-spend control workflow for batches of
`needs_review` tasks. Its value is not lowest raw token cost; it buys
repeatability, auditability, resumability, and safer coordination by preserving
the evidence behind every routing decision.

Cheap review means spending the lightweight deterministic pass first, then
reserving deeper review for tasks whose evidence is risky or incomplete.

## Triage Mode

Start with triage:

```bash
manciple review-queue --mode triage
```

Triage reads each active `needs_review` task, its latest run log, verification
evidence, changed files, readiness score, dependency state, and obvious scope
problems such as files outside `allowed_paths` or inside `forbidden_paths`. It
prints one row per task:

```text
pass      build-login-page   deterministic=pass
escalate  auth-migration     missing-evidence: Run log is missing expected verification command(s): pnpm test.
blocked   billing-worker     blocked-dependency: Dependency add-billing-schema is not complete.
```

Interpret those outcomes narrowly. `pass` means the recorded evidence is
complete enough for normal reviewer approval flow. `escalate` means a human or
deeper model review should inspect the unresolved evidence before approval.
`blocked` means review would be wasteful until lifecycle, dependency, or loading
problems are fixed.

## Deep Mode

Escalate only the risky work:

```bash
manciple review-queue --mode deep --deep-only risky
```

Deep mode generates review prompts for escalated tasks and includes a compact
packet with the task id, status, changed-file count, path summary, test
evidence, acceptance coverage, risk flags, and one reviewer question.

Add `--budget <tokens>` to cap the estimated packet budget for a queue run:

```bash
manciple review-queue --mode deep --deep-only risky --budget 12000
```

The budget is a simple planning estimate, not provider-specific token
accounting.

## Review Cost Tradeoffs

| Approach | Cost | Coordination Risk | Evidence Durability | Manual Tracking |
|---|---|---|---|---|
| Direct prompt review | Highest per task when used for everything | Easy to lose context across several tasks | Depends on the chat transcript | Reviewer must remember queue state |
| Triage review queue | Low first pass; spends attention on evidence gaps | Safer for batches because every row has a reason | Durable run logs and queue output | Queue output shows pass, escalate, and blocked work |
| Deep review queue | Higher, reserved for risky ambiguity | Focused on the tasks that need judgment | Review prompt plus compact packet | Reviewer follows the packet question and evidence |

The review queue composes existing commands rather than replacing them.
`manciple review-check` remains the source of readiness scoring and evidence
checklist semantics. `manciple coordinator` remains the source of owner queue
grouping, dependency usability, and path-conflict placement.
