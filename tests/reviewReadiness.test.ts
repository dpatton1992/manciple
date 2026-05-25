import { describe, expect, it } from "vitest";

import { evaluateReviewReadiness } from "../src/review/readiness.js";
import type { TaskSpec } from "../src/specs/schema.js";

const task: TaskSpec = {
  id: "review-ready-task",
  title: "Review ready task",
  status: "needs_review",
  type: "implementation",
  domain: "core",
  priority: "high",
  depends_on: [],
  allowed_paths: ["src/review/"],
  forbidden_paths: ["dist/"],
  goal: "Define a review readiness contract.",
  acceptance_criteria: ["Readiness can be evaluated."],
  verification: {
    commands: ["pnpm build", "pnpm test"],
  },
  outputs_required: ["files_changed", "tests_run", "decisions_made", "risks", "follow_ups"],
  notes: [],
};

describe("evaluateReviewReadiness", () => {
  it("reports ready when run-log evidence is complete", () => {
    const report = evaluateReviewReadiness(task, {
      runLogs: [{
        filesChanged: ["src/review/readiness.ts", "tests/reviewReadiness.test.ts"],
        testsRun: ["pnpm build", "pnpm test"],
        commandResults: [
          { command: "pnpm build", status: "passed" },
          { command: "pnpm test", status: "passed" },
        ],
        decisionsMade: ["Scored readiness with a checklist."],
        result: "complete",
        risks: "none",
        followUps: ["none"],
        acceptanceCriteriaEvidence: [{
          criterion: "Readiness can be evaluated.",
          evidence: "reviewReadiness tests cover complete receipts.",
        }],
      }],
    });

    expect(report.ready).toBe(true);
    expect(report.score).toBe(100);
    expect(report.humanReviewNeeded).toBe(false);
    expect(report.humanReviewReasons).toEqual([]);
    expect(report.hasRunLog).toBe(true);
    expect(report.hasChangedFiles).toBe(true);
    expect(report.changedFilesSource).toBe("run-log");
    expect(report.hasVerification).toBe(true);
    expect(report.hasVerificationCommands).toBe(true);
    expect(report.hasVerificationResults).toBe(true);
    expect(report.hasRisks).toBe(true);
    expect(report.missingReceiptFields).toEqual([]);
    expect(report.uncoveredAcceptanceCriteria).toEqual([]);
    expect(report.failedVerificationCommands).toEqual([]);
    expect(report.documentedRisks).toEqual([]);
    expect(report.missingEvidence).toEqual([]);
  });

  it("reports partial readiness with git-status changed files and missing run-log evidence", () => {
    const report = evaluateReviewReadiness(task, {
      gitChangedFiles: ["src/review/readiness.ts"],
      runLogs: [{
        commandsRun: ["pnpm build"],
        risks: "Deployment risk remains unknown.",
      }],
    });

    expect(report.ready).toBe(false);
    expect(report.hasRunLog).toBe(true);
    expect(report.hasChangedFiles).toBe(true);
    expect(report.changedFilesSource).toBe("git-status");
    expect(report.hasVerificationCommands).toBe(false);
    expect(report.hasVerificationResults).toBe(false);
    expect(report.hasVerification).toBe(false);
    expect(report.hasRisks).toBe(true);
    expect(report.missingVerificationCommands).toEqual(["pnpm test"]);
    expect(report.missingReceiptFields).toEqual(["tests_run", "decisions_made", "follow_ups"]);
    expect(report.documentedRisks).toEqual(["Deployment risk remains unknown."]);
    expect(report.uncoveredAcceptanceCriteria).toEqual(["Readiness can be evaluated."]);
    expect(report.missingEvidence).toContain("Run log is missing expected verification command(s): pnpm test.");
    expect(report.missingEvidence).toContain("No verification result is recorded in the run log.");
    expect(report.missingEvidence).toContain("Run log is missing required receipt field(s): tests_run, decisions_made, follow_ups.");
    expect(report.missingEvidence).toContain("Documented risk(s) need review: Deployment risk remains unknown.");
  });

  it("reports no-run-log missing evidence", () => {
    const report = evaluateReviewReadiness(task);

    expect(report.ready).toBe(false);
    expect(report.hasRunLog).toBe(false);
    expect(report.hasChangedFiles).toBe(false);
    expect(report.changedFilesSource).toBe("missing");
    expect(report.hasVerification).toBe(false);
    expect(report.hasRisks).toBe(false);
    expect(report.missingReceiptFields).toEqual(["files_changed", "tests_run", "decisions_made", "risks", "follow_ups"]);
    expect(report.missingEvidence).toContain("No run log is available for task review-ready-task.");
    expect(report.missingEvidence).toContain("No changed files are listed in the run log or available from git status.");
    expect(report.missingEvidence).toContain("No verification commands are recorded in the run log.");
    expect(report.missingEvidence).toContain("No verification result is recorded in the run log.");
    expect(report.missingEvidence).toContain("No risks entry is recorded in the run log; use \"none\" when no risks remain.");
    expect(report.missingEvidence).toContain("Run log is missing required receipt field(s): files_changed, tests_run, decisions_made, risks, follow_ups.");
  });

  it("distinguishes overlapping files from missing receipts", () => {
    const report = evaluateReviewReadiness(task, {
      gitChangedFiles: ["src/review/readiness.ts", "README.md"],
      runLogs: [{
        filesChanged: ["src/review/readiness.ts"],
        testsRun: ["pnpm build", "pnpm test"],
        result: "complete",
        decisionsMade: ["Recorded evidence categories separately."],
        risks: "none",
        followUps: ["none"],
        acceptanceCriteriaEvidence: [{
          criterion: "Readiness can be evaluated.",
          evidence: "Covered by tests.",
        }],
      }],
    });

    expect(report.ready).toBe(false);
    expect(report.missingReceiptFields).toEqual([]);
    expect(report.overlappingFiles).toEqual(["src/review/readiness.ts"]);
    expect(report.missingEvidence).toContain("Run-log files still overlap git changes: src/review/readiness.ts.");
  });

  it("distinguishes uncovered acceptance criteria", () => {
    const report = evaluateReviewReadiness(task, {
      runLogs: [{
        filesChanged: ["src/review/readiness.ts"],
        testsRun: ["pnpm build", "pnpm test"],
        result: "complete",
        decisionsMade: ["Recorded receipts."],
        risks: "none",
        followUps: ["none"],
      }],
    });

    expect(report.ready).toBe(false);
    expect(report.missingReceiptFields).toEqual([]);
    expect(report.uncoveredAcceptanceCriteria).toEqual(["Readiness can be evaluated."]);
  });

  it("distinguishes failing tests from absent tests", () => {
    const failing = evaluateReviewReadiness(task, {
      runLogs: [{
        filesChanged: ["src/review/readiness.ts"],
        testsRun: ["pnpm build", "pnpm test"],
        commandResults: [
          { command: "pnpm build", status: "passed" },
          { command: "pnpm test", status: "failed" },
        ],
        decisionsMade: ["Recorded failing test evidence."],
        risks: "none",
        followUps: ["none"],
        acceptanceCriteriaEvidence: [{
          criterion: "Readiness can be evaluated.",
          evidence: "Covered by tests.",
        }],
      }],
    });
    const absent = evaluateReviewReadiness(task, {
      runLogs: [{
        filesChanged: ["src/review/readiness.ts"],
        decisionsMade: ["No tests were run."],
        risks: "none",
        followUps: ["Run verification."],
        acceptanceCriteriaEvidence: [{
          criterion: "Readiness can be evaluated.",
          evidence: "Pending verification.",
        }],
      }],
    });

    expect(failing.failedVerificationCommands).toEqual(["pnpm test"]);
    expect(failing.absentVerificationCommands).toEqual([]);
    expect(absent.failedVerificationCommands).toEqual([]);
    expect(absent.absentVerificationCommands).toEqual(["pnpm build", "pnpm test"]);
  });
});
