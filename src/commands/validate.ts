import { loadTasks } from "../specs/loadTasks.js";
import { validateTasks } from "../specs/validateTasks.js";
import type { ValidationCounts } from "../specs/validateTasks.js";
import { getPaths } from "../utils/paths.js";
import { dirname, relative } from "path";

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function withLoadErrorCounts(counts: ValidationCounts, loadErrorCount: number): ValidationCounts {
  return {
    tasksChecked: counts.tasksChecked + loadErrorCount,
    domainsChecked: counts.domainsChecked,
    contractsChecked: counts.contractsChecked + loadErrorCount,
  };
}

export function validateCommand(specsTasksDir: string, cwd: string): void {
  const { tasks, errors: loadErrors } = loadTasks(specsTasksDir);
  const assignrRoot = relative(cwd, dirname(dirname(specsTasksDir)));
  const specsDomainsDir = getPaths(cwd, assignrRoot).specsDomains;

  let totalErrors = loadErrors.length;
  let totalWarnings = 0;

  // Report load errors first
  for (const { filePath, error } of loadErrors) {
    console.error(`  ✕ ${relative(cwd, filePath)}`);
    console.error(`    ${error}`);
  }

  if (tasks.length === 0 && loadErrors.length === 0) {
    console.warn(`  ⚠ No tasks found. Run "assignr new" to create your first task.`);
  }

  const { valid, invalid, warnings, counts } = validateTasks(tasks, { specsDomainsDir });
  const checkedCounts = withLoadErrorCounts(counts, loadErrors.length);

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

  console.log(`\nAssignr Validate`);
  console.log(`─────────────────`);
  console.log(
    `  Checked: ${formatCount(checkedCounts.tasksChecked, "task")}, ` +
      `${formatCount(checkedCounts.domainsChecked, "domain")}, ` +
      `${formatCount(checkedCounts.contractsChecked, "contract")}`
  );
  if (totalValid > 0) console.log(`  ✓ ${totalValid} valid task${totalValid === 1 ? "" : "s"}`);
  if (totalWarnings > 0) console.log(`  ⚠ ${totalWarnings} warning${totalWarnings === 1 ? "" : "s"}`);
  if (totalErrors > 0) console.log(`  ✕ ${totalErrors} invalid task${totalErrors === 1 ? "" : "s"}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}
