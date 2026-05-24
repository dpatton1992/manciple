import type { LoadedTask, TaskSpec } from "../specs/schema.js";

export type ChangedFilesSource = "run-log" | "git-status" | "missing";

export interface ReviewReadinessCommandResult {
  command: string;
  result?: string | null;
  status?: string | null;
}

export interface ReviewReadinessRunLog {
  filesChanged?: readonly string[];
  commandsRun?: readonly string[];
  verificationCommands?: readonly string[];
  verificationResults?: readonly string[];
  commandResults?: readonly ReviewReadinessCommandResult[];
  result?: string | null;
  risks?: string | null;
}

export interface ReviewReadinessEvidence {
  runLogs?: readonly ReviewReadinessRunLog[];
  gitChangedFiles?: readonly string[];
}

export interface ReviewReadinessReport {
  taskId: string;
  ready: boolean;
  hasRunLog: boolean;
  hasChangedFiles: boolean;
  changedFilesSource: ChangedFilesSource;
  hasVerificationCommands: boolean;
  hasVerificationResults: boolean;
  hasVerification: boolean;
  missingVerificationCommands: string[];
  hasRisks: boolean;
  missingEvidence: string[];
}

function specFrom(task: LoadedTask | TaskSpec): TaskSpec {
  return "spec" in task ? task.spec : task;
}

function presentValues(values: readonly (string | null | undefined)[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean) as string[])];
}

function hasExplicitValue(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

function runLogCommands(runLogs: readonly ReviewReadinessRunLog[]): string[] {
  return presentValues(runLogs.flatMap((log) => [
    ...(log.commandsRun ?? []),
    ...(log.verificationCommands ?? []),
    ...(log.commandResults ?? []).map((result) => result.command),
  ]));
}

function hasRecordedVerificationResult(runLogs: readonly ReviewReadinessRunLog[]): boolean {
  return runLogs.some((log) => (
    presentValues(log.verificationResults).length > 0 ||
    hasExplicitValue(log.result) ||
    (log.commandResults ?? []).some((result) => (
      hasExplicitValue(result.result) || hasExplicitValue(result.status)
    ))
  ));
}

function missingExpectedCommands(expected: readonly string[], recorded: readonly string[]): string[] {
  const recordedSet = new Set(recorded);
  return expected.filter((command) => !recordedSet.has(command));
}

export function evaluateReviewReadiness(
  task: LoadedTask | TaskSpec,
  evidence: ReviewReadinessEvidence = {}
): ReviewReadinessReport {
  const spec = specFrom(task);
  const runLogs = evidence.runLogs ?? [];
  const hasRunLog = runLogs.length > 0;

  const hasRunLogFiles = runLogs.some((log) => presentValues(log.filesChanged).length > 0);
  const hasGitFiles = presentValues(evidence.gitChangedFiles).length > 0;
  const changedFilesSource: ChangedFilesSource = hasRunLogFiles
    ? "run-log"
    : hasGitFiles
      ? "git-status"
      : "missing";

  const recordedCommands = runLogCommands(runLogs);
  const missingVerificationCommands = missingExpectedCommands(
    spec.verification.commands,
    recordedCommands
  );
  const hasVerificationCommands = recordedCommands.length > 0 &&
    missingVerificationCommands.length === 0;
  const hasVerificationResults = hasRecordedVerificationResult(runLogs);
  const hasVerification = hasVerificationCommands && hasVerificationResults;
  const hasRisks = runLogs.some((log) => hasExplicitValue(log.risks));

  const missingEvidence: string[] = [];
  if (!hasRunLog) {
    missingEvidence.push(`No run log is available for task ${spec.id}.`);
  }
  if (changedFilesSource === "missing") {
    missingEvidence.push("No changed files are listed in the run log or available from git status.");
  }
  if (recordedCommands.length === 0) {
    missingEvidence.push("No verification commands are recorded in the run log.");
  } else if (missingVerificationCommands.length > 0) {
    missingEvidence.push(
      `Run log is missing expected verification command(s): ${missingVerificationCommands.join(", ")}.`
    );
  }
  if (!hasVerificationResults) {
    missingEvidence.push("No verification result is recorded in the run log.");
  }
  if (!hasRisks) {
    missingEvidence.push("No risks entry is recorded in the run log; use \"none\" when no risks remain.");
  }

  return {
    taskId: spec.id,
    ready: missingEvidence.length === 0,
    hasRunLog,
    hasChangedFiles: changedFilesSource !== "missing",
    changedFilesSource,
    hasVerificationCommands,
    hasVerificationResults,
    hasVerification,
    missingVerificationCommands,
    hasRisks,
    missingEvidence,
  };
}
