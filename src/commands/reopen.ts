import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { loadTasks } from "../specs/loadTasks.js";
import type { TaskTier } from "../specs/loadTasks.js";
import { formatYamlDocument } from "../utils/yamlFormat.js";

export interface ReopenCommandOptions {
  specsTasksDir: string;
  activeDir: string;
  cwd: string;
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

export function reopenCommand(taskId: string, options: ReopenCommandOptions): void {
  const { specsTasksDir, activeDir, cwd } = options;
  const sourceTiers: TaskTier[] = ["completed", "archived"];
  const found = sourceTiers
    .flatMap((tier) => loadTasks(specsTasksDir, tier).tasks)
    .find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(`Task ${taskId} not found in completed or archived tasks.`);
    process.exit(1);
  }

  const destination = join(activeDir, `${taskId}.yaml`);
  if (existsSync(destination)) {
    console.error(`Task ${taskId} already exists in active tasks.`);
    process.exit(1);
  }

  const raw = readFileSync(found.filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  parsed["status"] = "in_progress";

  mkdirSync(activeDir, { recursive: true });
  writeFileSync(found.filePath, formatYamlDocument(parsed), "utf-8");
  moveTaskFile(found.filePath, destination);

  console.log(`Reopened: ${taskId} (from ${found.tier}) → ${destination.replace(cwd + "/", "")}`);
}
