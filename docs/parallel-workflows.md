# Parallel Workflows

Assignr is designed for small tasks that can move through a coordinator without
turning into long-lived branches. The dependency graph and path ownership fields
make parallel work explicit before agents start editing files.

## Dependency Fields

Use `depends_on` for work this task must wait for. Use `blocks` for work this
task unlocks. Use `conflicts_with` for tasks that should not run at the same
time. Use `can_run_independently` to tell a coordinator whether nearby work can
be scheduled without waiting.

```yaml
depends_on:
  - add-auth-session-model
blocks:
  - document-login-flow
conflicts_with:
  - refactor-auth-router
can_run_independently: false
allowed_paths:
  - src/features/auth/**
  - tests/auth/**
path_ownership:
  touched_paths:
    - src/features/auth/**
  locked_paths:
    - src/features/auth/session.ts
  unsafe_parallel_areas:
    - src/features/auth/router.ts
```

## Path Ownership

Path ownership helps a coordinator avoid collisions before compile and spot
rework after a run. `touched_paths` describe the expected edit surface,
`locked_paths` describe files that should not have concurrent writers, and
`unsafe_parallel_areas` describe areas where nearby changes are likely to
interact.

Path locks and unsafe parallel areas are scheduling and review signals. They do
not create filesystem locks.

## Worktree Guidance

Agents should start from the task worktree, usually
`.assignr/worktrees/<task-id>`. That keeps implementation changes, test output,
and review evidence isolated until the coordinator decides the slice is ready
to merge.

## Coordinator Owner Loop

1. Pick runnable tasks whose dependencies are satisfied and whose paths do not
   collide.
2. Leave waiting work in the queue when dependencies, locks, or unsafe areas
   make parallel execution risky.
3. Review run logs and queue output for completed slices.
4. Merge useful slices quickly when verification and receipts are strong.
5. Send overlapping or under-evidenced work back as rework instead of stacking
   more branches on top.

Every worker receipt should include files changed, tests run, decisions made,
risks, and follow-ups. Merge-readiness scoring and review queue packets are aids
for that owner loop: they summarize evidence and risk, but they do not replace a
human review of the task contract, diff, and integration behavior.

Prefer merging a verified small slice promptly over keeping many broad branches
open.
