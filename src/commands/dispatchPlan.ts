import { relative } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import { buildDispatchPlan } from "../coordination/reviewQueue.js";
import type { DispatchPlan } from "../coordination/reviewQueue.js";

export function createDispatchPlan(specsTasksDir: string, cwd: string): DispatchPlan {
  const { tasks, errors } = loadTasks(specsTasksDir, "all");
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${relative(cwd, error.filePath)}: ${error.error}`)
      .join("; ");
    throw new Error(`Cannot load tasks: ${message}`);
  }

  return buildDispatchPlan(tasks);
}

export function dispatchPlanCommand(specsTasksDir: string, cwd: string): void {
  try {
    console.log(JSON.stringify(createDispatchPlan(specsTasksDir, cwd), null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
