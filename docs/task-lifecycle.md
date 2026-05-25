# Task Lifecycle

Assignr keeps active work separate from audit history. New tasks start in
`.assignr/tasks/active`, which is the default context agents use when listing,
compiling, validating, and choosing work.

## Task Directories

```text
.assignr/tasks/
  active/      # pending, in-progress, blocked, and needs-review work
  completed/   # accepted or finished task history
  archived/    # abandoned or superseded task history
```

Use `active` for work that still needs attention. Use `completed` for accepted
or finished tasks that should remain available as history. Use `archived` for
work that was abandoned, superseded, or intentionally removed from the active
queue.

## Status Semantics

Active task files can move through statuses such as `pending`, `in_progress`,
`blocked`, and `needs_review`. A task in `needs_review` is still active because
it needs an independent reviewer decision.

Completed and archived task files are kept out of the default active queue.
They remain useful for audit history, planning context, and later inspection
with lifecycle-aware list flags.

## Lifecycle Commands

Move accepted or finished active work to completed history:

```bash
assignr complete build-login-page
```

Archive obsolete active work:

```bash
assignr archive replace-legacy-router
```

Move a completed or archived task back into active work:

```bash
assignr reopen replace-legacy-router
```

Inspect lifecycle history when you need it:

```bash
assignr list --completed
assignr list --archived
assignr list --all
```

Validate that task files live in the directory matching their status:

```bash
assignr check-lifecycle
```

Repos that still use the old flat task layout can migrate task files into the
lifecycle directories:

```bash
assignr migrate-tasks
```

For first-run setup, start with [Getting Started](getting-started.md).
