import { loadTasks } from "../specs/loadTasks.js";
import { validateTasks } from "../specs/validateTasks.js";
import { relative } from "path";

export function validateCommand(specsTasksDir: string, cwd: string): void {
  const { tasks, errors: loadErrors } = loadTasks(specsTasksDir);

  let totalErrors = loadErrors.length;
  let totalWarnings = 0;

  // Report load errors first
  for (const { filePath, error } of loadErrors) {
    console.error(`  ✕ ${relative(cwd, filePath)}`);
    console.error(`    ${error}`);
  }

  const { valid, invalid, warnings } = validateTasks(tasks);

  for (const { filePath, errors } of invalid) {
    totalErrors++;
    console.error(`  ✕ ${relative(cwd, filePath)}`);
    for (const issue of errors) {
      console.error(`    [${issue.field}] ${issue.message}`);
    }
  }

  for (const warning of warnings) {
    totalWarnings++;
    console.warn(`  ⚠ ${relative(cwd, warning.filePath)} [${warning.field}] ${warning.message}`);
  }

  const totalValid = valid.length;

  console.log(`\nPromptOps Validate`);
  console.log(`─────────────────`);
  if (totalValid > 0) console.log(`  ✓ ${totalValid} valid task${totalValid === 1 ? "" : "s"}`);
  if (totalWarnings > 0) console.log(`  ⚠ ${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`);
  if (totalErrors > 0) console.log(`  ✕ ${totalErrors} invalid task${totalErrors === 1 ? "" : "s"}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}
