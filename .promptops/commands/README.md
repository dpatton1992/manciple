# PromptOps Commands

This directory holds command reference files and local workflow notes.

## Usage

Run `promptops --help` to see all available commands.

## Workflow

```bash
promptops new "My task title" --type implementation --domain core --priority high
promptops validate
promptops compile my-task-title
# Run the generated prompt in your preferred coding agent
promptops run-log my-task-title
promptops set-status my-task-title needs_review
promptops review my-task-title
```
