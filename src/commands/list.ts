import { existsSync } from "fs";
import { basename, dirname, join } from "path";
import { STATUSES } from "../constants.js";
import { loadTasks } from "../specs/loadTasks.js";
import type { LoadedTaskWithTier, LoadTaskTier } from "../specs/loadTasks.js";

const MAX_TITLE_WIDTH = 50;

export interface ListCommandOptions {
  status?: string;
  domain?: string;
  completed?: boolean;
  archived?: boolean;
  all?: boolean;
}

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_WIDTH) {
    return title;
  }

  return `${title.slice(0, MAX_TITLE_WIDTH - 3)}...`;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function formatRows(tasks: LoadedTaskWithTier[], showTier: boolean): string[] {
  const rows = tasks.map(({ spec, tier }) => ({
    id: spec.id,
    title: truncateTitle(spec.title),
    status: spec.status,
    tier,
    deps: spec.depends_on.length,
  }));

  const idWidth = Math.max("ID".length, ...rows.map((row) => row.id.length));
  const titleWidth = MAX_TITLE_WIDTH;
  const statusWidth = Math.max("STATUS".length, ...rows.map((row) => row.status.length));
  const tierWidth = Math.max("TIER".length, ...rows.map((row) => row.tier.length));
  const depsWidth = Math.max("DEPS".length, ...rows.map((row) => String(row.deps).length));

  if (showTier) {
    return [
      `${pad("ID", idWidth)}  ${pad("TITLE", titleWidth)}  ${pad("STATUS", statusWidth)}  ${pad(
        "TIER",
        tierWidth
      )}  ${pad("DEPS", depsWidth)}`,
      ...rows.map(
        (row) =>
          `${pad(row.id, idWidth)}  ${pad(row.title, titleWidth)}  ${pad(row.status, statusWidth)}  ${pad(
            row.tier,
            tierWidth
          )}  ${pad(row.deps, depsWidth)}`
      ),
    ];
  }

  return [
    `${pad("ID", idWidth)}  ${pad("TITLE", titleWidth)}  ${pad("STATUS", statusWidth)}  ${pad("DEPS", depsWidth)}`,
    ...rows.map(
      (row) =>
        `${pad(row.id, idWidth)}  ${pad(row.title, titleWidth)}  ${pad(row.status, statusWidth)}  ${pad(
          row.deps,
          depsWidth
        )}`
    ),
  ];
}

function applyFilters(tasks: LoadedTaskWithTier[], options: ListCommandOptions): LoadedTaskWithTier[] {
  let filteredTasks = tasks;

  if (options.status) {
    if (!STATUSES.includes(options.status as (typeof STATUSES)[number])) {
      console.warn(`Invalid status filter: "${options.status}". Allowed: ${STATUSES.join(", ")}`);
    }

    filteredTasks = filteredTasks.filter((task) => task.spec.status === options.status);
  }

  if (options.domain) {
    filteredTasks = filteredTasks.filter((task) => task.spec.domain === options.domain);
  }

  return filteredTasks;
}

function resolveTier(options: ListCommandOptions): LoadTaskTier {
  const selectedTiers = [options.completed, options.archived, options.all].filter(Boolean).length;

  if (selectedTiers > 1) {
    console.error("Use only one of --completed, --archived, or --all");
    process.exit(1);
  }

  if (options.completed) {
    return "completed";
  }

  if (options.archived) {
    return "archived";
  }

  if (options.all) {
    return "all";
  }

  return "active";
}

function resolveTasksRoot(tasksDir: string): string {
  const lastSegment = basename(tasksDir);
  const parentDir = dirname(tasksDir);

  if (
    ["active", "completed", "archived"].includes(lastSegment) &&
    basename(parentDir) === "tasks"
  ) {
    return parentDir;
  }

  if (lastSegment === "tasks" && basename(parentDir) === "specs") {
    return join(dirname(parentDir), "tasks");
  }

  return tasksDir;
}

function requiredTaskDirs(specsTasksDir: string, tier: LoadTaskTier): string[] {
  const tasksRoot = resolveTasksRoot(specsTasksDir);

  if (tier === "all") {
    return ["active", "completed", "archived"].map((taskTier) =>
      join(tasksRoot, taskTier)
    );
  }

  return [join(tasksRoot, tier)];
}

export function listCommand(specsTasksDir: string, _cwd: string, options: ListCommandOptions = {}): void {
  const tier = resolveTier(options);
  const taskDirs = requiredTaskDirs(specsTasksDir, tier);
  const hasReadableTaskDir = taskDirs.some((taskDir) => existsSync(taskDir));

  if (!hasReadableTaskDir) {
    console.error(`Tasks directory does not exist: ${taskDirs[0]}`);
    process.exit(1);
  }

  const { tasks, errors } = loadTasks(specsTasksDir, tier);

  if (errors.length > 0) {
    console.warn(
      `  ⚠ ${errors.length} task file(s) could not be loaded (run "assignr validate" for details).`
    );
  }

  const hasFilters = Boolean(options.status || options.domain);
  const filteredTasks = applyFilters(tasks, options);

  if (filteredTasks.length === 0) {
    if (hasFilters) {
      console.log("No tasks match the given filters.");
      return;
    }

    console.log("No tasks found.");
    return;
  }

  for (const row of formatRows(filteredTasks, tier === "all")) {
    console.log(row);
  }
}
