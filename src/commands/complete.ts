import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import { loadTasks } from "../specs/loadTasks.js";

export interface CompleteCommandOptions {
  specsTasksDir: string;
  completedDir: string;
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

export function completeCommand(taskId: string, options: CompleteCommandOptions): void {
  const { specsTasksDir, completedDir, cwd } = options;
  const { tasks } = loadTasks(specsTasksDir, "active");
  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(`Task ${taskId} not found in active tasks.`);
    process.exit(1);
  }

  const destination = join(completedDir, `${taskId}.yaml`);
  if (existsSync(destination)) {
    console.error(`Task ${taskId} already exists in completed. Use assignr reopen first.`);
    process.exit(1);
  }

  const raw = readFileSync(found.filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  parsed["status"] = "complete";

  mkdirSync(completedDir, { recursive: true });
  writeFileSync(found.filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");
  moveTaskFile(found.filePath, destination);

  console.log(`Completed: ${taskId} → ${destination.replace(cwd + "/", "")}`);
}
