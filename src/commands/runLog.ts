import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { loadTasks } from "../specs/loadTasks.js";

export interface RunLogOptions {
  result?: string;
  taskStatus?: string;
  model?: string;
  agent?: string;
  harness?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  commandsRun?: string[];
  testsRun?: string[];
  filesChanged?: string[];
  decisionsMade?: string[];
  risks?: string;
  followUps?: string[];
  acceptanceCriteriaEvidence?: string[];
  verifyReceipt?: string;
  notes?: string;
}

interface AutoDetectedFiles {
  files: string[];
  source: string;
  fallback: string;
}

export function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")
    .replace("T", "-");
}

export function currentBranch(cwd: string): string {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf-8",
  });
  if (result.status !== 0 || !result.stdout) return "unknown";
  return result.stdout.trim() || "unknown";
}

function parseGitStatus(output: string): string[] {
  return output
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function detectChangedFiles(cwd: string): AutoDetectedFiles {
  const status = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd,
    encoding: "utf-8",
  });

  if (status.status === 0) {
    const files = unique(parseGitStatus(status.stdout ?? ""));
    return {
      files,
      source: "auto-detected from git status",
      fallback: files.length > 0
        ? ""
        : "No changed files detected by git status.",
    };
  }

  const diff = spawnSync("git", ["diff", "--name-only"], {
    cwd,
    encoding: "utf-8",
  });

  if (diff.status === 0) {
    const files = unique((diff.stdout ?? "").split("\n"));
    return {
      files,
      source: "auto-detected from git diff --name-only",
      fallback: files.length > 0
        ? ""
        : "No changed files detected by git diff --name-only.",
    };
  }

  return {
    files: [],
    source: "unknown",
    fallback: "Unknown: git is unavailable or this directory is not a git repository.",
  };
}

function renderList(values: string[] | undefined, source: string, unknownText: string): string {
  if (values?.length) {
    return [`_Source: ${source}_`, "", ...values.map((value) => `- ${value}`)].join("\n");
  }

  return [`_Source: unknown_`, "", unknownText].join("\n");
}

export function buildRunLog(
  title: string,
  id: string,
  status: string,
  generatedDir: string,
  cwd: string,
  options: RunLogOptions = {}
): string {
  const promptPath = `${generatedDir}/${id}.md`;
  const branch = currentBranch(cwd);
  const finalStatus = options.taskStatus ?? status;
  const detected = detectChangedFiles(cwd);
  const filesChanged = options.filesChanged?.length
    ? renderList(unique(options.filesChanged), "provided by user", "Unknown: no changed files were provided.")
    : renderList(detected.files, detected.source, detected.fallback);
  const commandsRun = renderList(
    options.commandsRun,
    "provided by user",
    "Unknown: no commands were provided. Pass repeated --command flags or MCP commands_run values."
  );
  const testsRun = renderList(
    options.testsRun,
    "provided by user",
    "Unknown: no tests were provided. Pass test commands in tests_run or provide a deterministic verify receipt."
  );
  const decisionsMade = renderList(
    options.decisionsMade,
    "provided by user",
    "Unknown: no decisions were provided. Completed implementation work that changed behavior must record Decisions Made; omit only when blocked before meaningful changes."
  );
  const followUps = renderList(
    options.followUps,
    "provided by user",
    "Unknown: not provided."
  );
  const acceptanceCriteriaEvidence = renderList(
    options.acceptanceCriteriaEvidence,
    "provided by user",
    "Unknown: not provided."
  );
  const verifyReceipt = options.verifyReceipt
    ? `_Source: provided by user_\n\n${options.verifyReceipt}`
    : "_Source: unknown_\n\nUnknown: no deterministic verify receipt was provided.";
  const agent = options.agent ?? options.harness;
  const agentSource = agent ? "provided by user" : "unknown";
  const modelSource = options.model ? "provided by user" : "unknown";
  const resultSource = options.result ? "provided by user" : "unknown";
  const risksSource = options.risks ? "provided by user" : "unknown";
  const notesSource = options.notes ? "provided by user" : "unknown";
  const tokenEvidence = [
    options.inputTokens !== undefined ? `- Input tokens: ${options.inputTokens}` : undefined,
    options.outputTokens !== undefined ? `- Output tokens: ${options.outputTokens}` : undefined,
    options.totalTokens !== undefined ? `- Total tokens: ${options.totalTokens}` : undefined,
  ].filter(Boolean).join("\n");
  const costEvidence = options.costUsd !== undefined ? `- Cost USD: ${options.costUsd}` : "";

  return `# Run Log: ${title}

## Metadata

- Task ID: ${id}
- Status: ${finalStatus}
- Started: ${new Date().toISOString()}
- Agent/Harness (${agentSource}): ${agent ?? "Unknown: not provided."}
- Model (${modelSource}): ${options.model ?? "Unknown: not provided."}
- Branch: ${branch}
${tokenEvidence || costEvidence ? `
## Usage Evidence

${tokenEvidence || "_Source: unknown_\n\nUnknown: no token evidence was provided."}

## Cost Evidence

${costEvidence || "_Source: unknown_\n\nUnknown: no cost evidence was provided."}
` : ""}

## Prompt Used

- Generated prompt path: ${promptPath}

## Files Changed

${filesChanged}

## Commands Run

${commandsRun}

## Tests Run

${testsRun}

## Verification Receipt

${verifyReceipt}

## Decisions Made

${decisionsMade}

## Result

<!-- complete | partial | blocked | failed -->
_Source: ${resultSource}_

${options.result ?? "Unknown: not provided."}

## Risks

_Source: ${risksSource}_

${options.risks ?? "Unknown: not provided."}

## Follow-Up Tasks

${followUps}

## Acceptance Criteria Evidence

${acceptanceCriteriaEvidence}

## Notes

_Source: ${notesSource}_

${options.notes ?? "Unknown: not provided."}
`;
}

export function runLogCommand(
  taskId: string,
  specsTasksDir: string,
  runsDir: string,
  generatedDir: string,
  cwd: string,
  options: RunLogOptions = {}
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

  const { spec } = found;

  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  const ts = timestamp();
  const outPath = join(runsDir, `${ts}-${taskId}.md`);
  const content = buildRunLog(spec.title, spec.id, spec.status, generatedDir, cwd, options);

  writeFileSync(outPath, content, "utf-8");
  console.log(`Created run log: ${outPath.replace(cwd + "/", "")}`);
}
