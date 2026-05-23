import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import { renderTemplate, REVIEW_TEMPLATE } from "../templates/renderTemplate.js";

export function reviewCommand(
  taskId: string,
  specsTasksDir: string,
  generatedDir: string,
  cwd: string
): void {
  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(`⚠ ${errors.length} task(s) failed to load.`);
  }

  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(
      `Task not found: ${taskId}\nRun "promptops status" to see available tasks.`
    );
    process.exit(1);
  }

  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  const rendered = renderTemplate(REVIEW_TEMPLATE, found.spec);
  const outPath = join(generatedDir, `review-${taskId}.md`);
  writeFileSync(outPath, rendered, "utf-8");

  console.log(`Created review prompt: ${outPath.replace(cwd + "/", "")}`);
}
