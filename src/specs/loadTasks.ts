import { readdirSync, readFileSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import { parse } from "yaml";
import { TaskSpecSchema } from "./schema.js";
import type { LoadedTask } from "./schema.js";

export type TaskTier = "active" | "completed" | "archived";
export type LoadTaskTier = TaskTier | "all";
export type LoadedTaskWithTier = LoadedTask & { tier: TaskTier };

export interface LoadResult {
  tasks: LoadedTaskWithTier[];
  errors: Array<{ filePath: string; error: string }>;
}

const TASK_TIERS: TaskTier[] = ["active", "completed", "archived"];

function getTasksRoot(tasksDir: string): string {
  const last = basename(tasksDir);
  const parent = dirname(tasksDir);

  if (TASK_TIERS.includes(last as TaskTier) && basename(parent) === "tasks") {
    return parent;
  }

  if (last === "tasks" && basename(parent) === "specs") {
    return join(dirname(parent), "tasks");
  }

  return tasksDir;
}

function loadTasksFromDir(tasksDir: string, tier: TaskTier): LoadResult {
  if (!existsSync(tasksDir)) {
    return { tasks: [], errors: [] };
  }

  const files = readdirSync(tasksDir).filter((f) => f.endsWith(".yaml"));
  const tasks: LoadedTaskWithTier[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const file of files) {
    const filePath = join(tasksDir, file);
    const raw = readFileSync(filePath, "utf-8");

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (err) {
      errors.push({
        filePath,
        error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const result = TaskSpecSchema.safeParse(parsed);
    if (!result.success) {
      const messages = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      errors.push({ filePath, error: messages });
      continue;
    }

    tasks.push({ spec: result.data, filePath, tier });
  }

  return { tasks, errors };
}

export function loadTasks(tasksDir: string, tier: LoadTaskTier = "active"): LoadResult {
  const tasksRoot = getTasksRoot(tasksDir);

  // Emit a one-time migration warning when legacy specs/tasks/ files are present
  // but are being bypassed because loadTasks now reads from tasks/{tier}/.
  const lastSegment = basename(tasksDir);
  const parentSegment = basename(dirname(tasksDir));
  if (lastSegment === "tasks" && parentSegment === "specs" && existsSync(tasksDir)) {
    const legacyFiles = readdirSync(tasksDir).filter((f) => f.endsWith(".yaml"));
    if (legacyFiles.length > 0) {
      console.warn(
        `\n  ⚠ Migration: ${legacyFiles.length} task file(s) in specs/tasks/ are not visible to assignr commands.` +
          `\n    Move them to tasks/active/ or run "assignr migrate-tasks" when available.\n`
      );
    }
  }

  const tiers = tier === "all" ? TASK_TIERS : [tier];
  const tasks: LoadedTaskWithTier[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const taskTier of tiers) {
    const result = loadTasksFromDir(join(tasksRoot, taskTier), taskTier);
    tasks.push(...result.tasks);
    errors.push(...result.errors);
  }

  return { tasks, errors };
}
