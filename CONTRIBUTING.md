# Contributing to Assignr

Thank you for your interest in contributing to Assignr! This document outlines the development setup, code style, pull request process, and how to report issues.

## Development Setup

Assignr is an ESM TypeScript project using pnpm as its package manager.

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

### Assignr Workflow Conventions

This project uses Assignr for structured task management. Key conventions from [AGENTS.md](AGENTS.md):

- **Task specs** live in `.assignr/specs/tasks/` and must not be edited directly — use `assignr_set_status` (or `assignr set-status`) for status changes.
- **Run logs** are written to `.assignr/runs/` via `assignr_run_log` (or `assignr run-log`).
- **Verification** uses `assignr_verify --profile worker|coordinator|review` (or `assignr verify --profile ...`).
- **MCP tools** are preferred over raw CLI calls when both are available.

See the [core domain spec](.assignr/specs/domains/core.yaml) for detailed project conventions.

## Pull Request Process

1. **Create a task**: Use `assignr new` to create a task spec for your change, or pick up an existing task from the queue with `assignr handoff`.
2. **Implement**: Make your changes, staying within the task's `allowed_paths` and respecting `forbidden_paths`.
3. **Verify**: Run the task's verification commands and confirm they pass:
   ```bash
   assignr verify --profile worker
   ```
4. **Record evidence**: Create a run log with `assignr run-log` documenting files changed, tests run, and any risks.
5. **Mark for review**: Set the task status to `needs_review`:
   ```bash
   assignr set-status <task-id> needs_review
   ```
6. **Review workflow**: A reviewer will pick up the task from the review queue. Follow the [review process](docs/review-queue.md) for triage and deep-review stages.

## How to Report Issues

We use GitHub issue templates to collect bug reports and feature requests.

- **Bug reports**: Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug-report.md) to report problems.
- **Feature requests**: Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature-request.md) to suggest improvements.

Please include as much detail as possible to help us reproduce and address the issue quickly.

## Task Lifecycle

Assignr tasks follow a defined lifecycle:

1. **Pending** — task is created but not started
2. **In Progress** — work is actively being done
3. **Needs Review** — implementation is complete and ready for review
4. **Complete** — reviewed and accepted
5. **Blocked / Failed / Partial** — exceptions handled as needed

Tasks move between lifecycle directories (`.assignr/tasks/active/`, `.assignr/tasks/completed/`, `.assignr/tasks/archived/`) based on their status. See the [Task Lifecycle docs](docs/task-lifecycle.md) for details.

## Questions?

If you have questions about contributing, feel free to open a discussion or ask in the issue tracker.
