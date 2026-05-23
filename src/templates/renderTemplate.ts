import type { TaskSpec } from "../specs/schema.js";

function formatList(items: string[] | undefined, bullet = "-"): string {
  if (!items || items.length === 0) return "_None specified._";
  return items.map((i) => `${bullet} ${i}`).join("\n");
}

export const IMPLEMENTATION_TEMPLATE = `# Agent Task: {{title}}

## Role

You are an implementation agent working inside this repo.

## Goal

{{goal}}

## Task Metadata

- ID: {{id}}
- Type: {{type}}
- Domain: {{domain}}
- Priority: {{priority}}
- Status: {{status}}

## Dependencies

{{depends_on}}

## Scope

### Allowed Paths

{{allowed_paths}}

### Forbidden Paths

{{forbidden_paths}}

## Acceptance Criteria

{{acceptance_criteria}}

## Verification Commands

{{verification_commands}}

## Required Output

When finished, report:

{{outputs_required}}

## Notes

{{notes}}

## Instructions

- Make the smallest safe change that satisfies the task.
- Follow existing repo conventions.
- Do not modify forbidden paths.
- Do not add dependencies unless necessary.
- Run the verification commands.
- If blocked, explain why and propose a follow-up task.
- If you discover required work outside scope, do not implement it. Create a follow-up recommendation.
`;

export const REVIEW_TEMPLATE = `# Review Task: {{title}}

You are reviewing an agent-produced change.

Evaluate whether the implementation satisfies the task without creating unnecessary risk.

## Task Metadata

- ID: {{id}}
- Domain: {{domain}}
- Status: {{status}}

## Goal

{{goal}}

## Acceptance Criteria

{{acceptance_criteria}}

## Verification Commands

{{verification_commands}}

## Allowed Paths

{{allowed_paths}}

## Forbidden Paths

{{forbidden_paths}}

## Check

- acceptance criteria
- changed files
- forbidden path violations
- dependency violations
- tests run
- type/lint/test failures
- architecture consistency
- duplicated abstractions
- excessive scope
- missing edge cases
- follow-up tasks

## Return

### Verdict

approved | needs_changes | blocked

### Findings

### Required Changes

### Suggested Follow-Ups

### Risk Assessment
`;

export const TEST_TEMPLATE = `# Test Task: {{title}}

## Role

You are a test agent. Your job is to ensure the implementation for this task is thoroughly tested.

## Task Metadata

- ID: {{id}}
- Domain: {{domain}}
- Priority: {{priority}}

## Goal

{{goal}}

## Acceptance Criteria

{{acceptance_criteria}}

## Verification Commands

{{verification_commands}}

## Allowed Paths

{{allowed_paths}}

## Instructions

- Write unit and integration tests for the acceptance criteria above.
- Do not modify application source beyond test setup.
- Run the verification commands to confirm all tests pass.
- Report coverage gaps and suggested follow-up test tasks.
`;

export function renderVerificationCommands(commands: string[]): string {
  if (!commands || commands.length === 0) return "_None specified._";
  return commands.map((cmd) => `\`\`\`bash\n${cmd}\n\`\`\``).join("\n\n");
}

export function renderTemplate(template: string, spec: TaskSpec): string {
  return template
    .replace(/{{title}}/g, spec.title)
    .replace(/{{id}}/g, spec.id)
    .replace(/{{type}}/g, spec.type)
    .replace(/{{domain}}/g, spec.domain)
    .replace(/{{priority}}/g, spec.priority ?? "medium")
    .replace(/{{status}}/g, spec.status)
    .replace(/{{goal}}/g, spec.goal.trim())
    .replace(
      /{{depends_on}}/g,
      formatList(spec.depends_on?.length ? spec.depends_on : undefined)
    )
    .replace(
      /{{allowed_paths}}/g,
      formatList(spec.allowed_paths?.length ? spec.allowed_paths : undefined)
    )
    .replace(
      /{{forbidden_paths}}/g,
      formatList(spec.forbidden_paths?.length ? spec.forbidden_paths : undefined)
    )
    .replace(/{{acceptance_criteria}}/g, formatList(spec.acceptance_criteria))
    .replace(
      /{{verification_commands}}/g,
      renderVerificationCommands(spec.verification?.commands ?? [])
    )
    .replace(
      /{{outputs_required}}/g,
      formatList(spec.outputs_required?.length ? spec.outputs_required : undefined)
    )
    .replace(
      /{{notes}}/g,
      formatList(spec.notes?.length ? spec.notes : undefined)
    );
}
