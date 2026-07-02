import { readFileSync } from "fs";
import type { Command } from "commander";
import { TASK_TYPES, PRIORITIES } from "../constants.js";
import type { TaskType, Priority, Status } from "../constants.js";
import { newCommand } from "./new.js";
import { listCommand } from "./list.js";
import { setStatusCommand } from "./setStatus.js";
import { archiveCommand } from "./archive.js";
import { reopenCommand } from "./reopen.js";
import { loadTasks } from "../specs/loadTasks.js";
import type { ManciplePaths } from "../utils/paths.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerTaskCommands(program: Command, p: ManciplePaths, cwd: string): void {
  const task = program
    .command("task")
    .description("Manage tasks. See `manciple task --help` for subcommands.")
    .action(() => {
      task.help();
    });

  // manciple task new <title>
  task
    .command("new <title>")
    .description("Create a new task spec (same as `manciple new`).")
    .option("--type <type>", `Task type (${TASK_TYPES.join(", ")})`, "implementation")
    .option("--domain <domain>", "Domain for this task.", "core")
    .option("--priority <priority>", `Priority (${PRIORITIES.join(", ")})`, "medium")
    .option("--goal <goal>", "Pre-fill the goal field.")
    .option("--implementation-note <note>", "Behavior, product, or design constraint. May be repeated.", collect, [])
    .action((title: string, opts: {
      type: string;
      domain: string;
      priority: string;
      goal?: string;
      implementationNote: string[];
    }) => {
      const type = opts.type as TaskType;
      const priority = opts.priority as Priority;
      if (!TASK_TYPES.includes(type)) {
        console.error(`Invalid type: "${type}". Allowed: ${TASK_TYPES.join(", ")}`);
        process.exit(1);
      }
      if (!PRIORITIES.includes(priority)) {
        console.error(`Invalid priority: "${priority}". Allowed: ${PRIORITIES.join(", ")}`);
        process.exit(1);
      }
      newCommand(title, {
        type,
        domain: opts.domain,
        priority,
        goal: opts.goal,
        cwd,
        activeDir: p.tasksActive,
        implementationNotes: opts.implementationNote,
      });
    });

  // manciple task list
  task
    .command("list")
    .description("List task specs (same as `manciple list`).")
    .option("--status <status>", "Show only tasks with this exact status (case-sensitive).")
    .option("--domain <domain>", "Show only tasks in this exact domain (case-sensitive).")
    .option("--completed", "Show completed tasks. Mutually exclusive with --archived and --all.")
    .option("--archived", "Show archived tasks. Mutually exclusive with --completed and --all.")
    .option("--all", "Show active, completed, and archived tasks. Mutually exclusive with --completed and --archived.")
    .option("--group-by <field>", 'Group tasks by "status", "domain", or "tier".')
    .action((opts: {
      status?: string;
      domain?: string;
      completed?: boolean;
      archived?: boolean;
      all?: boolean;
      groupBy?: string;
    }) => {
      listCommand(p.specsTasks, cwd, {
        status: opts.status,
        domain: opts.domain,
        completed: opts.completed,
        archived: opts.archived,
        all: opts.all,
        groupBy: opts.groupBy as "status" | "domain" | "tier" | undefined,
      });
    });

  // manciple task show <task-id>
  task
    .command("show <task-id>")
    .description("Show task details (prints the parsed task YAML).")
    .action((taskId: string) => {
      const { tasks, errors } = loadTasks(p.specsTasks, "all");
      if (errors.length > 0) {
        console.warn(`⚠ ${errors.length} task(s) failed to load.`);
      }
      const found = tasks.find((t) => t.spec.id === taskId);
      if (!found) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      const raw = readFileSync(found.filePath, "utf-8");
      console.log(raw);
    });

  // manciple task start <task-id>
  task
    .command("start <task-id>")
    .description("Start a task (set status to in_progress).")
    .action((taskId: string) => {
      setStatusCommand(taskId, "in_progress" as Status, p.specsTasks, cwd);
    });

  // manciple task pause <task-id> --reason <text>
  task
    .command("pause <task-id>")
    .description("Pause a task (set status to blocked). Requires --reason.")
    .requiredOption("--reason <text>", "Reason for pausing.")
    .action((taskId: string, opts: { reason: string }) => {
      setStatusCommand(taskId, "blocked" as Status, p.specsTasks, cwd);
    });

  // manciple task resume <task-id>
  task
    .command("resume <task-id>")
    .description("Resume a task (set status to pending, or reopen if archived/completed).")
    .action((taskId: string) => {
      const { tasks } = loadTasks(p.specsTasks, "all");
      const found = tasks.find((t) => t.spec.id === taskId);
      if (!found) {
        console.error(`Task not found: ${taskId}`);
        process.exit(1);
      }
      if (found.tier === "completed" || found.tier === "archived") {
        reopenCommand(taskId, {
          specsTasksDir: p.specsTasks,
          activeDir: p.tasksActive,
          cwd,
        });
      } else if (found.spec.status === "blocked") {
        setStatusCommand(taskId, "pending" as Status, p.specsTasks, cwd);
      } else {
        setStatusCommand(taskId, "in_progress" as Status, p.specsTasks, cwd);
      }
    });

  // manciple task archive <task-id>
  task
    .command("archive <task-id>")
    .description("Archive a task (same as `manciple archive`).")
    .action((taskId: string) => {
      archiveCommand(taskId, {
        specsTasksDir: p.specsTasks,
        archivedDir: p.tasksArchived,
        cwd,
      });
    });

  // manciple task reopen <task-id>
  task
    .command("reopen <task-id>")
    .description("Reopen a task (same as `manciple reopen`).")
    .action((taskId: string) => {
      reopenCommand(taskId, {
        specsTasksDir: p.specsTasks,
        activeDir: p.tasksActive,
        cwd,
      });
    });
}
