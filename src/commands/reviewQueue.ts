import { evaluateDeterministicReviewGate } from "../review/deterministicGate.js";
import type {
  DeterministicReviewBlocker,
  DeterministicReviewBlockerKind,
} from "../review/deterministicGate.js";

export type ReviewQueueMode = "triage";

export interface ReviewQueueCommandOptions {
  mode?: ReviewQueueMode;
  generatedDir?: string;
  activeDir?: string;
  completedDir?: string;
  archivedDir?: string;
}

const BLOCKED_KINDS = new Set<DeterministicReviewBlockerKind>([
  "load-error",
  "lifecycle-placement",
  "status-mismatch",
  "blocked-dependency",
  "completed-active",
  "active-wrong-directory",
]);

function decisionFor(blockers: readonly DeterministicReviewBlocker[]): "pass" | "escalate" | "blocked" {
  if (blockers.length === 0) return "pass";
  return blockers.some((blocker) => BLOCKED_KINDS.has(blocker.kind)) ? "blocked" : "escalate";
}

function formatReasons(blockers: readonly DeterministicReviewBlocker[]): string {
  if (blockers.length === 0) return "deterministic=pass";

  return blockers
    .map((blocker) => `${blocker.kind}: ${blocker.reason}`)
    .join(" | ");
}

export function reviewQueueCommand(
  specsTasksDir: string,
  cwd: string,
  options: ReviewQueueCommandOptions = {}
): void {
  const mode = options.mode ?? "triage";

  if (mode !== "triage") {
    console.error(`Unsupported review queue mode: ${mode}. Allowed: triage.`);
    process.exit(1);
  }

  const report = evaluateDeterministicReviewGate({
    specsTasksDir,
    cwd,
    generatedDir: options.generatedDir,
    activeDir: options.activeDir,
    completedDir: options.completedDir,
    archivedDir: options.archivedDir,
  });

  if (report.taskReports.length === 0 && report.loadBlockers.length === 0) {
    console.log("No active needs_review tasks found.");
    return;
  }

  for (const taskReport of report.taskReports) {
    const decision = decisionFor(taskReport.blockers);
    console.log(`${decision}\t${taskReport.taskId}\t${formatReasons(taskReport.blockers)}`);
  }

  for (const blocker of report.loadBlockers) {
    console.log(`blocked\t${blocker.taskId}\t${blocker.kind}: ${blocker.reason}`);
  }

  if (report.loadBlockers.length > 0 || report.taskReports.some((task) => decisionFor(task.blockers) === "blocked")) {
    process.exit(1);
  }
}
