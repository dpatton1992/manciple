import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { parse, stringify } from "yaml";
import { STATUSES } from "../constants.js";
import type { Status } from "../constants.js";
import { loadTasks } from "../specs/loadTasks.js";
import type { TaskTier } from "../specs/loadTasks.js";

const ACTIVE_STATUSES = new Set<Status>([
  "pending",
  "in_progress",
  "needs_review",
  "partial",
  "blocked",
  "failed",
]);

function getTasksRoot(tasksDir: string): string {
  const last = basename(tasksDir);
  const parent = dirname(tasksDir);

  if ((last === "active" || last === "completed" || last === "archived") && basename(parent) === "tasks") {
    return parent;
  }

  if (last === "tasks" && basename(parent) === "specs") {
    return join(dirname(parent), "tasks");
  }

  return tasksDir;
}

function tierForStatus(status: Status): TaskTier {
  if (status === "complete") return "completed";
  if (status === "archived") return "archived";
  if (ACTIVE_STATUSES.has(status)) return "active";
  return "active";
}

function moveTaskFile(source: string, destination: string): void {
  try {
    renameSync(source, destination);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EXDEV") {
      copyFileSync(source, destination);
      unlinkSync(source);
      return;
    }

    throw err;
  }
}

export function setStatusCommand(
  taskId: string,
  newStatus: Status,
  specsTasksDir: string,
  cwd: string
): void {
  if (!STATUSES.includes(newStatus)) {
    console.error(
      `Invalid status: "${newStatus}". Allowed: ${STATUSES.join(", ")}`
    );
    process.exit(1);
  }

  const { tasks } = loadTasks(specsTasksDir, "all");
  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(
      `Task not found: ${taskId}\n` +
        `Run "assignr list" to see available tasks.`
    );
    process.exit(1);
  }

  const raw = readFileSync(found.filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  const previousStatus = parsed["status"];
  parsed["status"] = newStatus;

  const destinationTier = tierForStatus(newStatus);
  const destinationDir = join(getTasksRoot(specsTasksDir), destinationTier);
  const destination = join(destinationDir, `${taskId}.yaml`);
  const shouldMove = found.tier !== destinationTier;

  if (shouldMove && existsSync(destination)) {
    console.error(`Task ${taskId} already exists in ${destinationTier} tasks.`);
    process.exit(1);
  }

  writeFileSync(found.filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");

  if (shouldMove) {
    mkdirSync(destinationDir, { recursive: true });
    moveTaskFile(found.filePath, destination);
  }

  const updatedPath = shouldMove ? destination : found.filePath;
  console.log(
    `Updated: ${updatedPath.replace(cwd + "/", "")}\n` +
      `  ${previousStatus} → ${newStatus}`
  );
}
