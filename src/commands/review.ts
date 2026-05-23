import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import type { TaskSpec } from "../specs/schema.js";

function formatList(items: string[] | undefined): string {
  if (!items || items.length === 0) return "_None specified._";
  return items.map((item) => `- ${item}`).join("\n");
}

function formatVerificationCommands(commands: string[] | undefined): string {
  if (!commands || commands.length === 0) return "_None specified._";
  return commands.map((cmd) => `\`\`\`bash\n${cmd}\n\`\`\``).join("\n\n");
}

function readLatestRunLog(cwd: string, taskId: string): string {
  const runLogDir = join(cwd, ".assignr", "runs", taskId);
  const runsDir = join(cwd, ".assignr", "runs");

  if (!existsSync(runLogDir)) {
    const flatLatestFile = existsSync(runsDir)
      ? readdirSync(runsDir)
          .filter((file) => file.endsWith(`-${taskId}.md`))
          .sort()
          .at(-1)
      : undefined;

    if (!flatLatestFile) {
      return "_No run log available._";
    }

    return readFileSync(join(runsDir, flatLatestFile), "utf-8").trim();
  }

  const latestFile = readdirSync(runLogDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .at(-1);

  if (!latestFile) {
    return "_No run log available._";
  }

  return readFileSync(join(runLogDir, latestFile), "utf-8").trim();
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
}

export function reviewCommand(
  taskId: string,
  specsTasksDir: string,
  generatedDir: string,
  cwd: string
): void {
  const { tasks, errors } = loadTasks(specsTasksDir);

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
  const outPath = join(generatedDir, `review-${taskId}.md`);
  writeFileSync(outPath, rendered, "utf-8");

  console.log(`Created review prompt: ${outPath.replace(cwd + "/", "")}`);
}
