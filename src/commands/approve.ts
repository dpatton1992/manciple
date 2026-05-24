import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import { loadTasks } from "../specs/loadTasks.js";
import type { LoadedTaskWithTier } from "../specs/loadTasks.js";
import { timestamp } from "./runLog.js";

export interface ReviewOutcomeCommandOptions {
  specsTasksDir: string;
  completedDir?: string;
  runsDir: string;
  cwd: string;
}

type ReviewOutcome = "approved" | "changes_requested" | "blocked";

function moveTaskFile(source: string, destination: string): void {
  try {
    renameSync(source, destination);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EXDEV") {
      copyFileSync(source, destination);
      unlinkSync(source);
      return;
    }

    throw err;
  }
}

function findReviewTask(taskId: string, specsTasksDir: string): LoadedTaskWithTier {
  const { tasks } = loadTasks(specsTasksDir, "all");
  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  if (found.spec.status !== "needs_review") {
    console.error(
      `Task ${taskId} is not ready for review outcome: expected needs_review, found ${found.spec.status}.`
    );
    process.exit(1);
  }

  if (found.tier !== "active") {
    console.error(`Task ${taskId} must be in active tasks to record a review outcome.`);
    process.exit(1);
  }

  return found;
}

function writeReviewOutcome(
  task: LoadedTaskWithTier,
  runsDir: string,
  cwd: string,
  outcome: ReviewOutcome,
  nextStatus: string,
  reason?: string
): string {
  mkdirSync(runsDir, { recursive: true });
  const outPath = join(runsDir, `${timestamp()}-${task.spec.id}-review-outcome.md`);
  const content = `# Review Outcome: ${task.spec.title}

## Metadata

- Task ID: ${task.spec.id}
- Previous Status: ${task.spec.status}
- Next Status: ${nextStatus}
- Outcome: ${outcome}
- Recorded: ${new Date().toISOString()}

## Reason

${reason?.trim() || "_No reason provided._"}
`;

  writeFileSync(outPath, content, "utf-8");
  return outPath.replace(cwd + "/", "");
}

function updateTaskStatus(filePath: string, status: string): void {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  parsed["status"] = status;
  writeFileSync(filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");
}

export function reviewChangesCommand(
  taskId: string,
  reason: string,
  status: "in_progress" | "blocked",
  outcome: Extract<ReviewOutcome, "changes_requested" | "blocked">,
  options: ReviewOutcomeCommandOptions
): void {
  if (!reason.trim()) {
    console.error("error: required option '--reason <text>' must not be empty");
    process.exit(1);
  }

  const found = findReviewTask(taskId, options.specsTasksDir);
  const outcomePath = writeReviewOutcome(found, options.runsDir, options.cwd, outcome, status, reason);
  updateTaskStatus(found.filePath, status);

  console.log(`Recorded review outcome: ${outcomePath}`);
  console.log(`Updated: ${found.filePath.replace(options.cwd + "/", "")}\n  needs_review → ${status}`);
}

export function approveCommand(taskId: string, options: ReviewOutcomeCommandOptions): void {
  const { completedDir, cwd } = options;

  if (!completedDir) {
    console.error("error: approve requires a completed tasks directory.");
    process.exit(1);
  }

  const found = findReviewTask(taskId, options.specsTasksDir);
  const destination = join(completedDir, `${taskId}.yaml`);

  if (existsSync(destination)) {
    console.error(`Task ${taskId} already exists in completed. Use assignr reopen first.`);
    process.exit(1);
  }

  const outcomePath = writeReviewOutcome(found, options.runsDir, cwd, "approved", "complete");

  mkdirSync(completedDir, { recursive: true });
  updateTaskStatus(found.filePath, "complete");
  moveTaskFile(found.filePath, destination);

  console.log(`Recorded review outcome: ${outcomePath}`);
  console.log(`Approved: ${taskId} → ${destination.replace(cwd + "/", "")}`);
}
