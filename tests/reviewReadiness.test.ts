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
  outputs_required: ["files_changed", "risks"],
  notes: [],
};

describe("evaluateReviewReadiness", () => {
  it("reports ready when run-log evidence is complete", () => {
    const report = evaluateReviewReadiness(task, {
      runLogs: [{
        filesChanged: ["src/review/readiness.ts", "tests/reviewReadiness.test.ts"],
        commandsRun: ["pnpm build", "pnpm test"],
        result: "complete",
        risks: "none",
      }],
    });

    expect(report.ready).toBe(true);
    expect(report.hasRunLog).toBe(true);
    expect(report.hasChangedFiles).toBe(true);
    expect(report.changedFilesSource).toBe("run-log");
    expect(report.hasVerification).toBe(true);
    expect(report.hasVerificationCommands).toBe(true);
    expect(report.hasVerificationResults).toBe(true);
    expect(report.hasRisks).toBe(true);
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
    expect(report.missingEvidence).toEqual([
      "Run log is missing expected verification command(s): pnpm test.",
      "No verification result is recorded in the run log.",
    ]);
  });

  it("reports no-run-log missing evidence", () => {
    const report = evaluateReviewReadiness(task);

    expect(report.ready).toBe(false);
    expect(report.hasRunLog).toBe(false);
    expect(report.hasChangedFiles).toBe(false);
    expect(report.changedFilesSource).toBe("missing");
    expect(report.hasVerification).toBe(false);
    expect(report.hasRisks).toBe(false);
    expect(report.missingEvidence).toEqual([
      "No run log is available for task review-ready-task.",
      "No changed files are listed in the run log or available from git status.",
      "No verification commands are recorded in the run log.",
      "No verification result is recorded in the run log.",
      "No risks entry is recorded in the run log; use \"none\" when no risks remain.",
    ]);
  });
});
