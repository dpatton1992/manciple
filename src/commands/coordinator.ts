import { loadTasks } from "../specs/loadTasks.js";
import { buildCoordinatorQueue } from "../coordination/reviewQueue.js";
import type { CoordinatorQueueRow } from "../coordination/reviewQueue.js";

function pad(value: string, width: number): string {
  return value.padEnd(width);
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  return `${value.slice(0, width - 3)}...`;
}

function printSection(label: string, rows: CoordinatorQueueRow[]): void {
  console.log(`\n${label}`);
  console.log("-".repeat(label.length));

  if (rows.length === 0) {
    console.log("  none");
    return;
  }

  const idWidth = Math.max("ID".length, ...rows.map((item) => item.id.length));
  const statusWidth = Math.max("STATUS".length, ...rows.map((item) => item.status.length));
  const priorityWidth = Math.max("PRIORITY".length, ...rows.map((item) => item.priority.length));

  console.log(
    `  ${pad("ID", idWidth)}  ${pad("STATUS", statusWidth)}  ${pad("PRIORITY", priorityWidth)}  REASON`
  );
  for (const row of rows) {
    console.log(
      `  ${pad(row.id, idWidth)}  ${pad(row.status, statusWidth)}  ${pad(row.priority, priorityWidth)}  ${truncate(row.reason, 96)}`
    );
  }
}

export function coordinatorCommand(specsTasksDir: string, _cwd: string): void {
  const { tasks, errors } = loadTasks(specsTasksDir, "all");

  if (errors.length > 0) {
    console.warn(
      `  Warning: ${errors.length} task file(s) could not be loaded (run "assignr validate" for details).`
    );
  }

  const queue = buildCoordinatorQueue(tasks);
  const sections: Array<[string, CoordinatorQueueRow[]]> = [
    ["runnable", queue.runnable],
    ["waiting", queue.waiting],
    ["needs_review", queue.needsReview],
    ["complete-ready", queue.completeReady],
    ["blocked", queue.blocked],
    ["rework-needed", queue.reworkNeeded],
  ];

  console.log("Assignr Coordinator Queue");
  for (const [label, rows] of sections) {
    printSection(label, rows);
  }
}
