import { loadTasks } from "../specs/loadTasks.js";
import { evaluateReviewReadiness } from "../review/readiness.js";
import {
  parseRunLogEvidence,
  readGitChangedFiles,
  readLatestRunLogContent,
} from "../review/evidence.js";

export function reviewCheckCommand(
  specsTasksDir: string,
  cwd: string,
  taskId?: string
): void {
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
      ? "-"
      : report.missingEvidence.join(" ");
    console.log(`${status}\t${task.spec.id}\t${detail}`);
  }

  if (hasMissingEvidence) {
    process.exit(1);
  }
}
