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
import {
  implementationPromptFilename,
  reviewPromptFilename,
} from "../templates/renderTemplate.js";
import type { TaskSpec } from "../specs/schema.js";
import {
  evaluateReviewReadiness,
  type ReviewReadinessRunLog,
} from "../review/readiness.js";

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

function readLatestRunLogContent(cwd: string, taskId: string): string | undefined {
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
      return undefined;
    }

    return readFileSync(join(runsDir, flatLatestFile), "utf-8").trim();
  }

  const latestFile = readdirSync(runLogDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .at(-1);

  if (!latestFile) {
    return undefined;
  }

  return readFileSync(join(runLogDir, latestFile), "utf-8").trim();
}

function readGitChangedFiles(cwd: string): string[] {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((path) => {
      const renameMarker = " -> ";
      return path.includes(renameMarker) ? path.split(renameMarker).pop() ?? path : path;
    })
    .filter(Boolean);
}

function extractSection(content: string, heading: string): string {
  const pattern = new RegExp(`^## ${heading}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/^## /m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function parseListSection(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseValueSection(section: string): string | undefined {
  const value = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("_Source:") && !line.startsWith("<!--"))
    .join("\n")
    .trim();

  if (!value || value.startsWith("Unknown:") || value === "TODO") {
    return undefined;
  }

  return value;
}

function parseRunLogEvidence(content: string | undefined): ReviewReadinessRunLog[] {
  if (!content) {
    return [];
  }

  return [{
    filesChanged: parseListSection(extractSection(content, "Files Changed")),
    commandsRun: parseListSection(extractSection(content, "Commands Run")),
    result: parseValueSection(extractSection(content, "Result")),
    risks: parseValueSection(extractSection(content, "Risks")),
  }];
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

function formatReadinessValue(value: boolean): string {
  return value ? "present" : "missing";
}

function renderReadinessSection(spec: TaskSpec, cwd: string): string {
  const latestRunLog = readLatestRunLogContent(cwd, spec.id);
  const report = evaluateReviewReadiness(spec, {
    runLogs: parseRunLogEvidence(latestRunLog),
    gitChangedFiles: readGitChangedFiles(cwd),
  });
  const missingEvidence = report.missingEvidence.length
    ? report.missingEvidence.map((item) => `- ${item}`).join("\n")
    : "_No missing readiness evidence._";

  return `## Review Readiness

- Overall: ${report.ready ? "ready" : "needs reviewer attention"}
- Run log evidence: ${formatReadinessValue(report.hasRunLog)}
- Changed files evidence: ${report.hasChangedFiles ? `present (${report.changedFilesSource})` : "missing"}
- Verification command evidence: ${report.hasVerificationCommands ? "complete" : "incomplete"}
- Verification result evidence: ${formatReadinessValue(report.hasVerificationResults)}
- Risk notes evidence: ${formatReadinessValue(report.hasRisks)}

### Missing Evidence

${missingEvidence}
`;
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

${renderReadinessSection(spec, cwd)}

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
