import {
  writeFileSync,
  mkdirSync,
  existsSync,
} from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import {
  implementationPromptFilename,
  reviewPromptFilename,
} from "../templates/renderTemplate.js";
import type { TaskSpec } from "../specs/schema.js";
import {
  readLatestRunLogContent,
} from "../review/evidence.js";

function formatList(items: string[] | undefined): string {
  if (!items || items.length === 0) return "_None specified._";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatVerificationCommands(commands: string[] | undefined): string {
  if (!commands || commands.length === 0) return "_None specified._";
  return commands.map((cmd) => `\`\`\`bash\n${cmd}\n\`\`\``).join("\n\n");
}

function readLatestRunLog(cwd: string, taskId: string): string {
  return readLatestRunLogContent(cwd, taskId) ?? "_No run log available._";
}

function readGitDiff(cwd: string): string {
  const result = spawnSync("git", ["diff", "HEAD"], {
    cwd,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return "_No diff available._";
  }

  const diff = result.stdout.trim();

  if (!diff) {
    return "_No changes staged._";
  }

  const lines = diff.split("\n");

  if (lines.length <= 400) {
    return `\`\`\`diff\n${diff}\n\`\`\``;
  }

  return `\`\`\`diff\n${lines.slice(0, 400).join("\n")}\n\`\`\`\n\n_Diff truncated after 400 lines._`;
}

function renderReviewPrompt(spec: TaskSpec, cwd: string): string {
  return `# Review Task: ${spec.title}

You are reviewing an agent-produced change.

Evaluate whether the implementation satisfies the task without creating unnecessary risk.

## Task Metadata

- ID: ${spec.id}
- Domain: ${spec.domain}
- Status: ${spec.status}

## Task Goal

${spec.goal.trim()}

## Acceptance Criteria

${formatList(spec.acceptance_criteria)}

## Verification Commands

${formatVerificationCommands(spec.verification?.commands)}

## Run Log

${readLatestRunLog(cwd, spec.id)}

## Git Diff

${readGitDiff(cwd)}

## Allowed Paths

${formatList(spec.allowed_paths)}

## Forbidden Paths

${formatList(spec.forbidden_paths)}

## Implementation Review

- [ ] Allowed paths: changed files are limited to the task's allowed paths or clearly justified.
- [ ] Forbidden paths: no forbidden paths were modified.
- [ ] Acceptance criteria evidence: each criterion has implementation evidence in the diff or run log.
- [ ] Verification evidence: required commands were run and their results are recorded.
- [ ] Generated artifacts: generated prompts, run logs, or other artifacts are present and named as expected.
- [ ] Risk notes: risks are recorded, or explicitly marked as none.

## Integration Review

- [ ] The change fits existing architecture and command/template conventions.
- [ ] Dependencies and lifecycle status are consistent with the task.
- [ ] Test, typecheck, and build coverage are adequate for the blast radius.
- [ ] No unnecessary abstractions, excessive scope, or duplicated behavior were introduced.
- [ ] Follow-up tasks are identified for any work outside scope.

## Decision

- [ ] Approve
- [ ] Request changes
- [ ] Block

### Reviewer Notes

### Findings

### Required Changes

### Suggested Follow-Ups

### Risk Assessment
`;
}

export function reviewCommand(
  taskId: string,
  specsTasksDir: string,
  generatedDir: string,
  cwd: string
): void {
  const { tasks, errors } = loadTasks(specsTasksDir, "all");

  if (errors.length > 0) {
    console.warn(`⚠ ${errors.length} task(s) failed to load.`);
  }

  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(
      `Task not found: ${taskId}\nRun "assignr status" to see available tasks.`
    );
    process.exit(1);
  }

  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  const rendered = renderReviewPrompt(found.spec, cwd);
  const outPath = join(generatedDir, reviewPromptFilename(taskId));
  writeFileSync(outPath, rendered, "utf-8");

  console.log(`Created review prompt: ${outPath.replace(cwd + "/", "")}`);
  console.log(
    `Review prompts are separate from compiled implementation prompts, which use ${join(
      generatedDir,
      implementationPromptFilename(taskId)
    ).replace(cwd + "/", "")}.`
  );
}
