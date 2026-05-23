import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import {
  renderTemplate,
  IMPLEMENTATION_TEMPLATE,
  REVIEW_TEMPLATE,
  TEST_TEMPLATE,
} from "../templates/renderTemplate.js";
import type { Status } from "../constants.js";
import type { TaskSpec } from "../specs/schema.js";

function getTemplate(type: TaskSpec["type"]): string {
  switch (type) {
    case "review":
      return REVIEW_TEMPLATE;
    case "test":
      return TEST_TEMPLATE;
    default:
      return IMPLEMENTATION_TEMPLATE;
  }
}

export interface CompileOptions {
  specsTasksDir: string;
  generatedDir: string;
  cwd: string;
  taskId?: string;
  status?: Status;
  all?: boolean;
}

export function compileCommand(options: CompileOptions): void {
  const { specsTasksDir, generatedDir, cwd, taskId, status, all } = options;
  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.error(`Cannot compile: ${errors.length} task(s) failed to load.`);
    for (const e of errors) {
      console.error(`  ✕ ${e.filePath.replace(cwd + "/", "")}: ${e.error}`);
    }
    process.exit(1);
  }

  let targets = tasks;

  if (taskId) {
    targets = tasks.filter((t) => t.spec.id === taskId);
    if (targets.length === 0) {
      console.error(`No task found with id: ${taskId}`);
      process.exit(1);
    }
  } else if (status) {
    targets = tasks.filter((t) => t.spec.status === status);
  } else if (!all) {
    // Default: compile pending and in_progress
    targets = tasks.filter(
      (t) => t.spec.status === "pending" || t.spec.status === "in_progress"
    );
  }

  if (targets.length === 0) {
    console.log("No tasks matched the compile criteria.");
    return;
  }

  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  for (const { spec } of targets) {
    const template = getTemplate(spec.type);
    const rendered = renderTemplate(template, spec);
    const outPath = join(generatedDir, `${spec.id}.md`);
    writeFileSync(outPath, rendered, "utf-8");
    console.log(`  ✓ Compiled: ${outPath.replace(cwd + "/", "")}`);
  }

  console.log(`\nCompiled ${targets.length} task${targets.length === 1 ? "" : "s"}.`);
}
