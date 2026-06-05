import picocolors from "picocolors";
import { loadTasks } from "../specs/loadTasks.js";
import { evaluateReviewReadiness } from "../review/readiness.js";
import {
  parseRunLogEvidence,
  readGitChangedFiles,
  readLatestRunLogContent,
} from "../review/evidence.js";
import { evaluateDeterministicReviewGate } from "../review/deterministicGate.js";
import {
  headerBanner,
  colorForStatus,
  statusSymbol,
  styleCell,
} from "../utils/styling.js";

export interface ReviewCheckCommandOptions {
  deterministic?: boolean;
  machine?: boolean;
  generatedDir?: string;
  activeDir?: string;
  completedDir?: string;
  archivedDir?: string;
}

function printTableHeader(idWidth: number, statusWidth: number): void {
  const rule = "─".repeat(idWidth + statusWidth + 4);
  console.log(`  ${styleCell("TASK", undefined, idWidth)}  ${styleCell("STATUS", undefined, statusWidth)}  SCORE  HUMAN REVIEW  DETAILS`);
  console.log(`  ${rule}`);
}

function formatScore(score: number, width: number = 5): string {
  return String(score).padStart(width);
}

export function reviewCheckCommand(
  specsTasksDir: string,
  cwd: string,
  taskId?: string,
  options: ReviewCheckCommandOptions = {}
): void {
  if (options.deterministic) {
    const report = evaluateDeterministicReviewGate({
      specsTasksDir,
      cwd,
      taskId,
      generatedDir: options.generatedDir,
      activeDir: options.activeDir,
      completedDir: options.completedDir,
      archivedDir: options.archivedDir,
    });

    const blockers = [
      ...report.loadBlockers,
      ...report.taskReports.flatMap((taskReport) => taskReport.blockers),
    ];

    if (taskId && report.taskReports.length === 0) {
      console.error(
        `Task not found: ${taskId}\nRun "assignr list --status needs_review" to see review tasks.`
      );
      process.exit(1);
    }

    // --machine mode: tab-delimited backward compat
    if (options.machine) {
      if (blockers.length === 0) {
        if (report.taskReports.length === 0) {
          console.log(taskId
            ? `No needs_review task matched ${taskId}.`
            : "No active needs_review tasks found.");
          return;
        }
        for (const taskReport of report.taskReports) {
          console.log(`ready\t${taskReport.taskId}\tdeterministic=pass`);
        }
        return;
      }
      for (const taskReport of report.taskReports) {
        if (taskReport.blockers.length === 0) {
          console.log(`ready\t${taskReport.taskId}\tdeterministic=pass`);
          continue;
        }
        for (const blocker of taskReport.blockers) {
          console.log(`blocked\t${blocker.taskId}\t${blocker.kind}\t${blocker.reason}`);
        }
      }
      for (const blocker of report.loadBlockers) {
        console.log(`blocked\t${blocker.taskId}\t${blocker.kind}\t${blocker.reason}`);
      }
      process.exit(1);
    }

    // Formatted deterministic output
    console.log(headerBanner().trimEnd());

    if (blockers.length === 0) {
      if (report.taskReports.length === 0) {
        console.log(taskId
          ? `  No needs_review task matched ${taskId}.`
          : "  No active needs_review tasks found.");
        return;
      }
      const idWidth = Math.max(4, ...report.taskReports.map((r) => r.taskId.length));
      const statusLabel = "DETERMINISTIC GATE";
      const statusWidth = Math.max(statusLabel.length, 5);
      const rule = "─".repeat(idWidth + statusWidth + 4);
      console.log(`  ${styleCell("TASK", undefined, idWidth)}  ${styleCell(statusLabel, undefined, statusWidth)}  DETAILS`);
      console.log(`  ${rule}`);
      for (const taskReport of report.taskReports) {
        const gateLabel = `${picocolors.green("✓")} pass`;
        console.log(`  ${styleCell(taskReport.taskId, undefined, idWidth)}  ${styleCell(gateLabel, undefined, statusWidth)}  deterministic=pass`);
      }
      return;
    }

    const allEntries: Array<{ taskId: string; gate: string; detail: string }> = [];
    for (const taskReport of report.taskReports) {
      if (taskReport.blockers.length === 0) {
        allEntries.push({ taskId: taskReport.taskId, gate: `${picocolors.green("✓")} pass`, detail: "deterministic=pass" });
        continue;
      }
      for (const blocker of taskReport.blockers) {
        allEntries.push({ taskId: blocker.taskId, gate: `${picocolors.red("⊘")} blocked`, detail: `${blocker.kind}: ${blocker.reason}` });
      }
    }
    for (const blocker of report.loadBlockers) {
      allEntries.push({ taskId: blocker.taskId, gate: `${picocolors.red("⊘")} blocked`, detail: `${blocker.kind}: ${blocker.reason}` });
    }

    const idWidth = Math.max(4, ...allEntries.map((e) => e.taskId.length));
    const statusLabel = "DETERMINISTIC GATE";
    const statusWidth = Math.max(statusLabel.length, ...allEntries.map((e) => e.gate.length));
    const rule = "─".repeat(idWidth + statusWidth + 4);
    console.log(`  ${styleCell("TASK", undefined, idWidth)}  ${styleCell(statusLabel, undefined, statusWidth)}  DETAILS`);
    console.log(`  ${rule}`);
    for (const entry of allEntries) {
      console.log(`  ${styleCell(entry.taskId, undefined, idWidth)}  ${styleCell(entry.gate, undefined, statusWidth)}  ${entry.detail}`);
    }

    process.exit(1);
  }

  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(`  ⚠ ${errors.length} task(s) failed to load.`);
  }

  if (taskId && !tasks.some((task) => task.spec.id === taskId)) {
    console.error(
      `Task not found: ${taskId}\nRun "assignr list --status needs_review" to see review tasks.`
    );
    process.exit(1);
  }

  const reviewTasks = tasks.filter((task) => (
    task.spec.status === "needs_review" &&
    (!taskId || task.spec.id === taskId)
  ));

  if (reviewTasks.length === 0) {
    console.log(taskId
      ? `  No needs_review task matched ${taskId}.`
      : "  No active needs_review tasks found.");
    return;
  }

  const gitChangedFiles = readGitChangedFiles(cwd);
  let hasMissingEvidence = false;

  // --machine mode: tab-delimited backward compat
  if (options.machine) {
    for (const task of reviewTasks) {
      const report = evaluateReviewReadiness(task, {
        runLogs: parseRunLogEvidence(readLatestRunLogContent(cwd, task.spec.id)),
        gitChangedFiles,
      });
      if (!report.ready) {
        hasMissingEvidence = true;
      }
      const status = report.ready ? "ready" : "missing";
      const detail = report.ready
        ? report.humanReviewNeeded ? report.humanReviewReasons.join(" ") : "human review not required by evidence checklist"
        : report.missingEvidence.join(" ");
      console.log(`${status}\t${task.spec.id}\tscore=${report.score}\thuman_review=${report.humanReviewNeeded ? "yes" : "no"}\t${detail}`);
    }
    if (hasMissingEvidence) {
      process.exit(1);
    }
    return;
  }

  // Formatted output
  console.log(headerBanner().trimEnd());

  const idWidth = Math.max(4, ...reviewTasks.map((t) => t.spec.id.length));
  const statusWidth = Math.max(6, ...reviewTasks.map(() => 8)); // "✓ ready" or "✕ missing"
  printTableHeader(idWidth, statusWidth);

  for (const task of reviewTasks) {
    const report = evaluateReviewReadiness(task, {
      runLogs: parseRunLogEvidence(readLatestRunLogContent(cwd, task.spec.id)),
      gitChangedFiles,
    });

    if (!report.ready) {
      hasMissingEvidence = true;
    }

    const statusLabel = report.ready ? `${picocolors.green("✓")} ready` : `${picocolors.red("✕")} missing`;
    const hrLabel = report.humanReviewNeeded ? picocolors.yellow("yes") : "no";
    const detail = report.ready
      ? report.humanReviewNeeded ? report.humanReviewReasons.join(" ") : "human review not required by evidence checklist"
      : report.missingEvidence.join(" ");
    console.log(`  ${styleCell(task.spec.id, undefined, idWidth)}  ${styleCell(statusLabel, undefined, statusWidth)}  ${formatScore(report.score)}  ${styleCell(hrLabel, undefined, 11)}  ${detail}`);
  }

  if (hasMissingEvidence) {
    process.exit(1);
  }
}
