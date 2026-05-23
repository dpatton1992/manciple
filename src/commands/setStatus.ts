import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import { STATUSES } from "../constants.js";
import type { Status } from "../constants.js";

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

  const filePath = join(specsTasksDir, `${taskId}.yaml`);

  if (!existsSync(filePath)) {
    console.error(
      `Task not found: ${filePath.replace(cwd + "/", "")}\n` +
        `Run "promptops status" to see available tasks.`
    );
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  const previousStatus = parsed["status"];
  parsed["status"] = newStatus;

  writeFileSync(filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");

  console.log(
    `Updated: ${filePath.replace(cwd + "/", "")}\n` +
      `  ${previousStatus} → ${newStatus}`
  );
}
