import { readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "yaml";
import { STATUSES } from "../constants.js";
import type { Status } from "../constants.js";
import { loadTasks } from "../specs/loadTasks.js";

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

  writeFileSync(found.filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");

  console.log(
    `Updated: ${found.filePath.replace(cwd + "/", "")}\n` +
      `  ${previousStatus} → ${newStatus}`
  );
}
