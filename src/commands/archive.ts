import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { loadTasks } from "../specs/loadTasks.js";
import { formatYamlDocument } from "../utils/yamlFormat.js";
import { colorForStatus } from "../utils/styling.js";
import picocolors from "picocolors";

export interface ArchiveCommandOptions {
  specsTasksDir: string;
  archivedDir: string;
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

export function archiveCommand(taskId: string, options: ArchiveCommandOptions): void {
  const { specsTasksDir, archivedDir, cwd } = options;
  const { tasks } = loadTasks(specsTasksDir, "active");
  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(`Task ${taskId} not found in active tasks.`);
    process.exit(1);
  }

  const destination = join(archivedDir, `${taskId}.yaml`);
  if (existsSync(destination)) {
    console.error(`Task ${taskId} already exists in archived.`);
    process.exit(1);
  }

  const raw = readFileSync(found.filePath, "utf-8");
  const parsed = parse(raw) as Record<string, unknown>;
  parsed["status"] = "archived";

  mkdirSync(archivedDir, { recursive: true });
  writeFileSync(found.filePath, formatYamlDocument(parsed), "utf-8");
  moveTaskFile(found.filePath, destination);

  console.log(`${picocolors.dim("Archived:")} ${taskId} ${picocolors.yellow("→")} ${colorForStatus("archived")(destination.replace(cwd + "/", ""))}`);
}
