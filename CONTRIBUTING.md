# Contributing to Manciple

Thank you for your interest in contributing to Manciple! This document outlines the development setup, code style, pull request process, and how to report issues.

## Development Setup

Manciple is an ESM TypeScript project using pnpm as its package manager.

```bash
# Install dependencies
pnpm install

# Build the project (compiles src/ to dist/)
pnpm build

# Run tests (vitest)
pnpm test

# Type-check the codebase
pnpm typecheck

# Format YAML files
pnpm format:yaml
```

### Prerequisites

- Node.js 18+
- pnpm

## Code Style

- **Language**: ESM TypeScript — all source code lives in `src/` and is compiled to `dist/` via `tsc`.
- **Tests**: Written with [vitest](https://vitest.dev/) and located in `tests/`.
- **Formatting**: YAML files should be formatted with `pnpm format:yaml`.
- **Commands**: CLI commands print to stdout; errors go to stderr with `process.exit(1)`.
- **Dependencies**: Minimal external runtime — only four declared production dependencies.

### Manciple Workflow Conventions

This project uses Manciple for structured task management. Key conventions from [AGENTS.md](AGENTS.md):

- **Task specs** live in `.manciple/specs/tasks/` and must not be edited directly — use `manciple_set_status` (or `manciple set-status`) for status changes.
- **Run logs** are written to `.manciple/runs/` via `manciple_run_log` (or `manciple run-log`).
- **Verification** uses `manciple_verify --profile worker|coordinator|review` (or `manciple verify --profile ...`).
- **MCP tools** are preferred over raw CLI calls when both are available.

See the [core domain spec](.manciple/specs/domains/core.yaml) for detailed project conventions.

## Pull Request Process

1. **Create a task**: Use `manciple new` to create a task spec for your change, or pick up an existing task from the queue with `manciple handoff`.
2. **Implement**: Make your changes, staying within the task's `allowed_paths` and respecting `forbidden_paths`.
3. **Verify**: Run the task's verification commands and confirm they pass:
   ```bash
   manciple verify --profile worker
   ```
4. **Record evidence**: Create a run log with `manciple run-log` documenting files changed, tests run, and any risks.
5. **Mark for review**: Set the task status to `needs_review`:
   ```bash
   manciple set-status <task-id> needs_review
   ```
6. **Review workflow**: A reviewer will pick up the task from the review queue. Follow the [review process](docs/review-queue.md) for triage and deep-review stages.

## How to Report Issues

We use GitHub issue templates to collect bug reports and feature requests.

- **Bug reports**: Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug-report.md) to report problems.
- **Feature requests**: Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature-request.md) to suggest improvements.

Please include as much detail as possible to help us reproduce and address the issue quickly.

## Task Lifecycle

Manciple tasks follow a defined lifecycle:

1. **Pending** — task is created but not started
2. **In Progress** — work is actively being done
3. **Needs Review** — implementation is complete and ready for review
4. **Complete** — reviewed and accepted
5. **Blocked / Failed / Partial** — exceptions handled as needed

Tasks move between lifecycle directories (`.manciple/tasks/active/`, `.manciple/tasks/completed/`, `.manciple/tasks/archived/`) based on their status. See the [Task Lifecycle docs](docs/task-lifecycle.md) for details.

## Questions?

If you have questions about contributing, feel free to open a discussion or ask in the issue tracker.
