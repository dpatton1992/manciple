import type { LoadedTask, TaskSpec } from "../specs/schema.js";

export type ChangedFilesSource = "run-log" | "git-status" | "missing";

export interface ReviewReadinessCommandResult {
  command: string;
  result?: string | null;
  status?: string | null;
}

export interface ReviewReadinessAcceptanceEvidence {
  criterion: string;
  evidence?: string | null;
}

export interface ReviewReadinessRunLog {
  filesChanged?: readonly string[];
  testsRun?: readonly string[];
  commandsRun?: readonly string[];
  verificationCommands?: readonly string[];
  verificationResults?: readonly string[];
  commandResults?: readonly ReviewReadinessCommandResult[];
  decisionsMade?: readonly string[];
  result?: string | null;
  risks?: string | null;
  followUps?: readonly string[];
  acceptanceCriteriaEvidence?: readonly ReviewReadinessAcceptanceEvidence[];
  notes?: string | null;
}

export interface ReviewReadinessEvidence {
  runLogs?: readonly ReviewReadinessRunLog[];
  gitChangedFiles?: readonly string[];
}

export interface ReviewReadinessReport {
  taskId: string;
  ready: boolean;
  score: number;
  checklist: ReviewReadinessChecklistItem[];
  humanReviewNeeded: boolean;
  humanReviewReasons: string[];
  hasRunLog: boolean;
  hasChangedFiles: boolean;
  changedFilesSource: ChangedFilesSource;
  overlappingFiles: string[];
  hasVerificationCommands: boolean;
  hasVerificationResults: boolean;
  hasVerification: boolean;
  missingVerificationCommands: string[];
  failedVerificationCommands: string[];
  absentVerificationCommands: string[];
  hasRisks: boolean;
  documentedRisks: string[];
  missingReceiptFields: string[];
  uncoveredAcceptanceCriteria: string[];
  missingEvidence: string[];
}

export interface ReviewReadinessChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  reason?: string;
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
    ...(log.testsRun ?? []),
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

function normalizeReceiptField(field: string): string {
  return field.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function receiptFieldIsPresent(
  field: string,
  runLogs: readonly ReviewReadinessRunLog[],
  changedFilesSource: ChangedFilesSource,
  hasVerification: boolean,
  hasRisks: boolean
): boolean {
  switch (normalizeReceiptField(field)) {
    case "files_changed":
      return changedFilesSource !== "missing";
    case "tests_run":
      return hasVerification;
    case "commands_run":
      return runLogCommands(runLogs).length > 0;
    case "decisions_made":
      return runLogs.some((log) => presentValues(log.decisionsMade).length > 0);
    case "risks":
      return hasRisks;
    case "follow_ups":
    case "follow_up_tasks":
      return runLogs.some((log) => presentValues(log.followUps).length > 0);
    default:
      return runLogs.some((log) => (
        presentValues(log.decisionsMade).some((value) => value.toLowerCase().includes(field.toLowerCase())) ||
        presentValues(log.followUps).some((value) => value.toLowerCase().includes(field.toLowerCase())) ||
        hasExplicitValue(log.notes) && log.notes!.toLowerCase().includes(field.toLowerCase())
      ));
  }
}

function isExplicitNone(value: string): boolean {
  return /^(none|no known|no residual|n\/a)$/i.test(value.trim().replace(/\.$/, ""));
}

function documentedRisks(runLogs: readonly ReviewReadinessRunLog[]): string[] {
  return presentValues(runLogs.map((log) => log.risks)).filter((risk) => !isExplicitNone(risk));
}

function failedVerificationCommands(runLogs: readonly ReviewReadinessRunLog[]): string[] {
  const failedFromResults = runLogs.flatMap((log) => (
    log.commandResults ?? []
  ).filter((result) => {
    const value = `${result.status ?? ""} ${result.result ?? ""}`.toLowerCase();
    return /\b(fail|failed|error|non-zero|nonzero)\b/.test(value);
  }).map((result) => result.command));

  const failedFromText = runLogs.flatMap((log) => presentValues(log.verificationResults))
    .filter((result) => /\b(fail|failed|error|non-zero|nonzero)\b/i.test(result));

  const failedFromOutcome = runLogs
    .filter((log) => /\b(failed|blocked)\b/i.test(log.result ?? ""))
    .flatMap((log) => presentValues([
      ...(log.commandsRun ?? []),
      ...(log.testsRun ?? []),
      ...(log.verificationCommands ?? []),
    ]));

  return presentValues([...failedFromResults, ...failedFromText, ...failedFromOutcome]);
}

function changedFilesFromRunLogs(runLogs: readonly ReviewReadinessRunLog[]): string[] {
  return presentValues(runLogs.flatMap((log) => log.filesChanged ?? []));
}

function pathOverlaps(runLogs: readonly ReviewReadinessRunLog[], gitChangedFiles: readonly string[] | undefined): string[] {
  const receiptFiles = new Set(changedFilesFromRunLogs(runLogs));
  return presentValues(gitChangedFiles).filter((file) => receiptFiles.has(file));
}

function uncoveredAcceptanceCriteria(spec: TaskSpec, runLogs: readonly ReviewReadinessRunLog[]): string[] {
  const evidence = runLogs.flatMap((log) => log.acceptanceCriteriaEvidence ?? []);
  const covered = new Set(evidence
    .filter((entry) => hasExplicitValue(entry.evidence))
    .map((entry) => entry.criterion.trim()));
  const searchableEvidence = presentValues(runLogs.flatMap((log) => [
    ...(log.decisionsMade ?? []),
    ...(log.followUps ?? []),
    log.notes,
  ])).join("\n").toLowerCase();

  return spec.acceptance_criteria.filter((criterion) => (
    !covered.has(criterion) &&
    !searchableEvidence.includes(criterion.toLowerCase())
  ));
}

function scoreFrom(checklist: readonly ReviewReadinessChecklistItem[]): number {
  const passed = checklist.filter((item) => item.passed).length;
  return Math.round((passed / checklist.length) * 100);
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
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
  const failedCommands = failedVerificationCommands(runLogs);
  const hasVerificationCommands = recordedCommands.length > 0 &&
    missingVerificationCommands.length === 0;
  const hasVerificationResults = hasRecordedVerificationResult(runLogs);
  const hasVerification = hasVerificationCommands && hasVerificationResults && failedCommands.length === 0;
  const hasRisks = runLogs.some((log) => hasExplicitValue(log.risks));
  const risks = documentedRisks(runLogs);
  const overlappingFiles = pathOverlaps(runLogs, evidence.gitChangedFiles);
  const uncoveredCriteria = uncoveredAcceptanceCriteria(spec, runLogs);
  const missingReceiptFields = spec.outputs_required.filter((field) => (
    !receiptFieldIsPresent(field, runLogs, changedFilesSource, hasVerification, hasRisks)
  ));

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
  if (failedCommands.length > 0) {
    missingEvidence.push(`Verification command(s) appear to have failed: ${failedCommands.join(", ")}.`);
  }
  if (!hasRisks) {
    missingEvidence.push("No risks entry is recorded in the run log; use \"none\" when no risks remain.");
  }
  if (missingReceiptFields.length > 0) {
    missingEvidence.push(`Run log is missing required receipt field(s): ${missingReceiptFields.join(", ")}.`);
  }
  if (uncoveredCriteria.length > 0) {
    missingEvidence.push(sentence(`Acceptance criteria without evidence: ${uncoveredCriteria.join(" | ")}`));
  }
  if (risks.length > 0) {
    missingEvidence.push(sentence(`Documented risk(s) need review: ${risks.join(" | ")}`));
  }
  if (overlappingFiles.length > 0) {
    missingEvidence.push(sentence(`Run-log files still overlap git changes: ${overlappingFiles.join(", ")}`));
  }

  const checklist: ReviewReadinessChecklistItem[] = [
    {
      id: "receipt",
      label: "Required receipt fields are present",
      passed: missingReceiptFields.length === 0,
      reason: missingReceiptFields.length ? missingReceiptFields.join(", ") : undefined,
    },
    {
      id: "changed-files",
      label: "Changed files are recorded",
      passed: changedFilesSource !== "missing",
      reason: changedFilesSource === "missing" ? "missing" : changedFilesSource,
    },
    {
      id: "tests",
      label: "Expected tests are recorded and passing",
      passed: hasVerification,
      reason: [
        ...missingVerificationCommands.map((command) => `missing ${command}`),
        ...failedCommands.map((command) => `failed ${command}`),
        !hasVerificationResults ? "missing result" : "",
      ].filter(Boolean).join("; ") || undefined,
    },
    {
      id: "path-overlap",
      label: "Run-log files do not overlap current git changes",
      passed: overlappingFiles.length === 0,
      reason: overlappingFiles.join(", ") || undefined,
    },
    {
      id: "acceptance",
      label: "Acceptance criteria have evidence",
      passed: uncoveredCriteria.length === 0,
      reason: uncoveredCriteria.join(" | ") || undefined,
    },
    {
      id: "risks",
      label: "No documented residual risks",
      passed: hasRisks && risks.length === 0,
      reason: !hasRisks ? "missing risks receipt" : risks.join(" | ") || undefined,
    },
  ];
  const score = scoreFrom(checklist);
  const humanReviewReasons = checklist
    .filter((item) => !item.passed)
    .map((item) => item.reason ? `${item.label}: ${item.reason}` : item.label);
  const humanReviewNeeded = humanReviewReasons.length > 0;

  return {
    taskId: spec.id,
    ready: missingEvidence.length === 0,
    score,
    checklist,
    humanReviewNeeded,
    humanReviewReasons,
    hasRunLog,
    hasChangedFiles: changedFilesSource !== "missing",
    changedFilesSource,
    overlappingFiles,
    hasVerificationCommands,
    hasVerificationResults,
    hasVerification,
    missingVerificationCommands,
    failedVerificationCommands: failedCommands,
    absentVerificationCommands: missingVerificationCommands,
    hasRisks,
    documentedRisks: risks,
    missingReceiptFields,
    uncoveredAcceptanceCriteria: uncoveredCriteria,
    missingEvidence,
  };
}
