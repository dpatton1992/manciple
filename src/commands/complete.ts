import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
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
      rmSync(source);
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
    console.error(
      `Active task not found: ${taskId}\n` +
        `Run "assignr list" to see active tasks.`
    );
    process.exit(1);
  }

  const destination = join(completedDir, `${taskId}.yaml`);
  if (existsSync(destination)) {
    console.error(
      `Completed task already exists: ${destination.replace(cwd + "/", "")}\n` +
        `Refusing to overwrite it.`
    );
    process.exit(1);
  }

  const raw = readFileSync(found.filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  const previousStatus = parsed["status"];
  parsed["status"] = "complete";

  mkdirSync(completedDir, { recursive: true });
  writeFileSync(found.filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");
  moveTaskFile(found.filePath, destination);

  console.log(
    `Completed: ${destination.replace(cwd + "/", "")}\n` +
      `  ${previousStatus} -> complete`
  );
}
