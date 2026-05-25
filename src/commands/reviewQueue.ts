import { basename, dirname, join } from "path";
import { evaluateDeterministicReviewGate } from "../review/deterministicGate.js";
import type {
  DeterministicReviewBlocker,
  DeterministicReviewBlockerKind,
  DeterministicReviewTaskReport,
} from "../review/deterministicGate.js";
import { createReviewPrompt } from "./review.js";

export type ReviewQueueMode = "triage" | "deep";
export type ReviewQueueDeepOnly = "risky";

export interface ReviewQueueCommandOptions {
  mode?: ReviewQueueMode;
  all?: boolean;
  budget?: string | number;
  deepOnly?: ReviewQueueDeepOnly | string;
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

function formatDeepEvidence(taskReport: DeterministicReviewTaskReport): string {
  const readiness = taskReport.readiness;

  if (!readiness) return "readiness=unavailable";

  const evidence = [
    `score=${readiness.score}`,
    `changedFiles=${readiness.changedFilesSource}`,
    readiness.missingEvidence.length > 0 ? `missing=${readiness.missingEvidence.join(" | ")}` : "",
    readiness.failedVerificationCommands.length > 0
      ? `failedVerification=${readiness.failedVerificationCommands.join(", ")}`
      : "",
    readiness.missingVerificationCommands.length > 0
      ? `missingVerification=${readiness.missingVerificationCommands.join(", ")}`
      : "",
    readiness.documentedRisks.length > 0 ? `risks=${readiness.documentedRisks.join(" | ")}` : "",
    readiness.overlappingFiles.length > 0 ? `overlappingFiles=${readiness.overlappingFiles.join(", ")}` : "",
    readiness.missingReceiptFields.length > 0
      ? `missingReceiptFields=${readiness.missingReceiptFields.join(", ")}`
      : "",
    readiness.uncoveredAcceptanceCriteria.length > 0
      ? `uncoveredAcceptanceCriteria=${readiness.uncoveredAcceptanceCriteria.join(" | ")}`
      : "",
  ].filter(Boolean);

  return evidence.join("; ");
}

function riskFlagsFor(taskReport: DeterministicReviewTaskReport): string[] {
  const readiness = taskReport.readiness;
  const flags = new Set<string>();

  for (const blocker of taskReport.blockers) {
    switch (blocker.kind) {
      case "missing-evidence":
      case "missing-run-log":
      case "missing-generated-prompt":
      case "missing-review-log":
        flags.add("missing-evidence");
        break;
      case "path-policy":
        flags.add("scope-violation");
        break;
      case "blocked-dependency":
        flags.add("dependency-conflict");
        break;
      case "path-ownership":
        flags.add("coordinator-rework");
        break;
      default:
        break;
    }
  }

  if ((readiness?.failedVerificationCommands.length ?? 0) > 0) {
    flags.add("failed-verification");
  }
  if ((readiness?.documentedRisks.length ?? 0) > 0) {
    flags.add("documented-risk");
  }
  if ((readiness?.uncoveredAcceptanceCriteria.length ?? 0) > 0) {
    flags.add("incomplete-acceptance-evidence");
  }
  if ((readiness?.missingReceiptFields.length ?? 0) > 0) {
    flags.add("missing-receipt");
  }

  return [...flags].sort();
}

function allowedPathSummary(taskReport: DeterministicReviewTaskReport): string {
  const outsideAllowed = taskReport.blockers.filter((blocker) => (
    blocker.kind === "path-policy" && blocker.reason.includes("outside allowed_paths")
  )).length;
  const forbidden = taskReport.blockers.filter((blocker) => (
    blocker.kind === "path-policy" && blocker.reason.includes("matches forbidden_paths")
  )).length;

  return `allowed:${outsideAllowed} forbidden:${forbidden}`;
}

function evidenceCoverage(taskReport: DeterministicReviewTaskReport): string {
  const total = taskReport.acceptanceCriteriaCount;
  const uncovered = taskReport.readiness?.uncoveredAcceptanceCriteria.length ?? total;
  const covered = Math.max(0, total - uncovered);

  return `${covered}/${total}`;
}

function reviewerQuestionFor(taskReport: DeterministicReviewTaskReport): string {
  const readiness = taskReport.readiness;
  const firstReason = taskReport.blockers[0]?.reason ?? readiness?.humanReviewReasons[0] ?? "";

  if (/failed|verification/i.test(firstReason)) {
    return "Which verification result should the reviewer trust?";
  }
  if (/outside allowed_paths|forbidden_paths|scope/i.test(firstReason)) {
    return "Should the out-of-scope file change be accepted or sent back?";
  }
  if (/dependency/i.test(firstReason)) {
    return "Is the dependency state safe enough for review to continue?";
  }
  if (/risk/i.test(firstReason)) {
    return "Is the documented residual risk acceptable for approval?";
  }
  if (/acceptance/i.test(firstReason)) {
    return "Which acceptance criterion still needs evidence?";
  }

  return "What evidence would let the reviewer make a confident decision?";
}

function compressedPacketFor(taskReport: DeterministicReviewTaskReport): string {
  const readiness = taskReport.readiness;
  const changedFileCount = readiness?.changedFiles.length ?? 0;
  const testsReported = readiness?.hasVerification ? "yes" : "no";
  const riskFlags = riskFlagsFor(taskReport);

  return [
    `id=${taskReport.taskId}`,
    `status=${taskReport.status}`,
    `changedFiles=${changedFileCount}`,
    `path=${allowedPathSummary(taskReport)}`,
    `tests=${testsReported}`,
    `criteria=${taskReport.acceptanceCriteriaCount}`,
    `evidence=${evidenceCoverage(taskReport)}`,
    `risks=${riskFlags.length > 0 ? riskFlags.join(",") : "none"}`,
    `question=${reviewerQuestionFor(taskReport)}`,
  ].join(";");
}

function estimatedTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function parseBudget(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const normalized = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    console.error("Invalid review queue budget: expected a positive integer.");
    process.exit(1);
  }

  return normalized;
}

function rel(cwd: string, path: string): string {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

function assignrRootFrom(tasksDir: string): string {
  const last = basename(tasksDir);
  const parent = dirname(tasksDir);

  if (last === "active" || last === "completed" || last === "archived") {
    return dirname(parent);
  }

  if (last === "tasks" && basename(parent) === "specs") {
    return dirname(parent);
  }

  return dirname(tasksDir);
}

function runTriageMode(
  report: ReturnType<typeof evaluateDeterministicReviewGate>
): void {
  for (const taskReport of report.taskReports) {
    const decision = decisionFor(taskReport.blockers);
    console.log(`${decision}\t${taskReport.taskId}\t${formatReasons(taskReport.blockers)}`);
  }

  for (const blocker of report.loadBlockers) {
    console.log(`blocked\t${blocker.taskId}\t${blocker.kind}: ${blocker.reason}`);
  }
}

function runDeepMode(
  specsTasksDir: string,
  cwd: string,
  generatedDir: string,
  report: ReturnType<typeof evaluateDeterministicReviewGate>,
  includeAll: boolean,
  budget: number | undefined,
  deepOnly: ReviewQueueDeepOnly | undefined
): void {
  let emitted = 0;
  let queued = 0;
  let usedBudget = 0;

  for (const taskReport of report.taskReports) {
    const decision = decisionFor(taskReport.blockers);
    const riskFlags = riskFlagsFor(taskReport);

    if (decision === "blocked" || (!includeAll && decision === "pass")) {
      continue;
    }
    if (deepOnly === "risky" && riskFlags.length === 0) {
      continue;
    }

    queued += 1;
    const packet = compressedPacketFor(taskReport);
    const packetCost = estimatedTokens(packet);

    if (budget !== undefined && usedBudget + packetCost > budget) {
      continue;
    }

    const promptPath = createReviewPrompt(taskReport.taskId, specsTasksDir, generatedDir, cwd);
    usedBudget += packetCost;
    emitted += 1;
    console.log([
      decision === "pass" ? "deep-all" : "deep",
      taskReport.taskId,
      `prompt=${rel(cwd, promptPath)}`,
      `packet=${packet}`,
      `reasons=${formatReasons(taskReport.blockers)}`,
      `evidence=${formatDeepEvidence(taskReport)}`,
    ].join("\t"));
  }

  for (const blocker of report.loadBlockers) {
    console.log(`blocked\t${blocker.taskId}\t${blocker.kind}: ${blocker.reason}`);
  }

  const blockedReports = report.taskReports.filter((task) => decisionFor(task.blockers) === "blocked");

  for (const taskReport of blockedReports) {
    console.log(`blocked\t${taskReport.taskId}\t${formatReasons(taskReport.blockers)}`);
  }

  if (emitted === 0 && report.loadBlockers.length === 0 && blockedReports.length === 0) {
    console.log("No tasks escalated for deep review.");
  }

  if (budget !== undefined) {
    console.log(`budget\tlimit=${budget}\tfit=${emitted}/${queued}\testimated=${usedBudget}`);
  }
}

export function reviewQueueCommand(
  specsTasksDir: string,
  cwd: string,
  options: ReviewQueueCommandOptions = {}
): void {
  const mode = options.mode ?? "triage";
  const generatedDir = options.generatedDir ?? join(assignrRootFrom(specsTasksDir), "prompts", "generated");
  const budget = parseBudget(options.budget);
  const deepOnly = options.deepOnly;

  if (mode !== "triage" && mode !== "deep") {
    console.error(`Unsupported review queue mode: ${mode}. Allowed: triage, deep.`);
    process.exit(1);
  }
  if (deepOnly !== undefined && deepOnly !== "risky") {
    console.error(`Unsupported review queue deep-only filter: ${deepOnly}. Allowed: risky.`);
    process.exit(1);
  }

  const report = evaluateDeterministicReviewGate({
    specsTasksDir,
    cwd,
    generatedDir,
    activeDir: options.activeDir,
    completedDir: options.completedDir,
    archivedDir: options.archivedDir,
  });

  if (report.taskReports.length === 0 && report.loadBlockers.length === 0) {
    console.log("No active needs_review tasks found.");
    return;
  }

  if (mode === "deep") {
    runDeepMode(
      specsTasksDir,
      cwd,
      generatedDir,
      report,
      options.all ?? false,
      budget,
      deepOnly
    );
  } else {
    runTriageMode(report);
    if (budget !== undefined) {
      const rows = report.taskReports.length;
      console.log(`budget\tlimit=${budget}\tfit=${rows}/${rows}\testimated=${rows}`);
    }
  }

  if (report.loadBlockers.length > 0 || report.taskReports.some((task) => decisionFor(task.blockers) === "blocked")) {
    process.exit(1);
  }
}
