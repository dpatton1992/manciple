import { checkLifecycleCommand } from "../src/commands/checkLifecycle.js";
import { getPaths } from "../src/utils/paths.js";

const cwd = process.cwd();
const p = getPaths(cwd, ".assignr");

checkLifecycleCommand({
  cwd,
  activeDir: p.tasksActive,
  completedDir: p.tasksCompleted,
  archivedDir: p.tasksArchived,
});
