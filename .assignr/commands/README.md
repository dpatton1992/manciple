# Assignr Commands

This directory holds command reference files and local workflow notes.

## Usage

Run `assignr --help` to see all available commands.

## Workflow

```bash
assignr new "My task title" --type implementation --domain core --priority high
assignr validate
assignr compile my-task-title
# Run the generated prompt in your preferred coding agent
assignr run-log my-task-title
assignr set-status my-task-title needs_review
assignr review my-task-title
```
