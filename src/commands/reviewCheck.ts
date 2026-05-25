import { loadTasks } from "../specs/loadTasks.js";
import { evaluateReviewReadiness } from "../review/readiness.js";
import {
  parseRunLogEvidence,
  readGitChangedFiles,
  readLatestRunLogContent,
} from "../review/evidence.js";
import { evaluateDeterministicReviewGate } from "../review/deterministicGate.js";

export interface ReviewCheckCommandOptions {
  deterministic?: boolean;
  generatedDir?: string;
  activeDir?: string;
  completedDir?: string;
  archivedDir?: string;
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

  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(`⚠ ${errors.length} task(s) failed to load.`);
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
      ? `No needs_review task matched ${taskId}.`
      : "No active needs_review tasks found.");
    return;
  }

  const gitChangedFiles = readGitChangedFiles(cwd);
  let hasMissingEvidence = false;

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
}
