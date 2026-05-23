import { existsSync } from "fs";
import { relative } from "path";
import { loadTasks } from "../specs/loadTasks.js";
import type { LoadedTask } from "../specs/schema.js";

const MAX_TITLE_WIDTH = 50;

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_WIDTH) {
    return title;
  }

  return `${title.slice(0, MAX_TITLE_WIDTH - 3)}...`;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function formatRows(tasks: LoadedTask[]): string[] {
  const rows = tasks.map(({ spec }) => ({
    id: spec.id,
    title: truncateTitle(spec.title),
    status: spec.status,
    deps: spec.depends_on.length,
  }));

  const idWidth = Math.max("ID".length, ...rows.map((row) => row.id.length));
  const titleWidth = MAX_TITLE_WIDTH;
  const statusWidth = Math.max("STATUS".length, ...rows.map((row) => row.status.length));
  const depsWidth = Math.max("DEPS".length, ...rows.map((row) => String(row.deps).length));

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

export function listCommand(specsTasksDir: string, cwd: string): void {
  if (!existsSync(specsTasksDir)) {
    console.error(`Tasks directory does not exist: ${relative(cwd, specsTasksDir)}`);
    process.exit(1);
  }

  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(
      `  ⚠ ${errors.length} task file(s) could not be loaded (run "assignr validate" for details).`
    );
  }

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  for (const row of formatRows(tasks)) {
    console.log(row);
  }
}
