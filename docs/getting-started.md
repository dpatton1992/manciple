# Getting Started

This guide expands the short README quickstart into the normal first run:
install Assignr, initialize a repo, create a scoped task, compile an agent
prompt, and record review evidence afterward.

## Install

Assignr requires Node.js 18+.

```bash
npm install -g assignr
assignr --help
```

## Initialize A Repo

Run `assignr init` at the root of the repo where agents will work:

```bash
assignr init
```

This one command does everything to set up the repo:

- Creates `.assignr/` with configuration, task directories, prompt output,
  run logs, and review evidence folders.
- Adds Assignr entries to `.gitignore`.
- Writes `.mcp.json` with the Assignr MCP server (keyed to the repo directory
  name so it is unique per repo).
- Copies packaged agent skills (`.claude/skills/`, `.codex/skills/`) and
  OpenCode agents (`.opencode/agents/`) from the installed npm package into
  your repo root so agent harnesses can find them.

Running `assignr init` again is safe — it skips anything already set up.
Use `--force` to overwrite existing files.

## Create And Handoff A Task

Create a task with a clear title, type, domain, and priority:

```bash
assignr new "Build login page" --type implementation --domain auth --priority high
assignr validate
assignr status
assignr handoff build-login-page
```

The task spec is written to `.assignr/tasks/active/build-login-page.yaml`.
The compiled agent prompt is written to
`.assignr/prompts/generated/build-login-page.md`.

Paste the compiled prompt into Claude Code, Codex, Cursor, Aider, Goose, or
another coding agent. The prompt carries the task goal, allowed paths,
acceptance criteria, verification commands, and evidence the agent should
report.

## Record Evidence

After the implementation agent finishes, record what happened:

```bash
assignr run-log build-login-page \
  --result complete \
  --agent Codex \
  --model gpt-5-codex \
  --command "pnpm test -- auth" \
  --file "src/features/auth/LoginPage.tsx" \
  --risks "No known risks."
```

Then move the task to review and generate the reviewer prompt:

```bash
assignr set-status build-login-page needs_review
assignr review build-login-page
```

For lifecycle details, see [Task Lifecycle](task-lifecycle.md). For the review
workflow, see [Evidence and Review](evidence-and-review.md).
