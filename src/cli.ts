#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { loadConfig } from "./config.js";
import { getPaths } from "./utils/paths.js";
import { DEFAULT_ROOT, STATUSES, TASK_TYPES, PRIORITIES } from "./constants.js";
import { initCommand } from "./commands/init.js";
import { newCommand, newInteractiveCommand } from "./commands/new.js";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { setStatusCommand } from "./commands/setStatus.js";
import { completeCommand } from "./commands/complete.js";
import { archiveCommand } from "./commands/archive.js";
import { checkLifecycleCommand } from "./commands/checkLifecycle.js";
import { runLogCommand } from "./commands/runLog.js";
import { reviewCommand } from "./commands/review.js";
import { doctorCommand } from "./commands/doctor.js";
import { mcpConfigCommand } from "./commands/mcpConfig.js";
import type { Status, TaskType, Priority } from "./constants.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

const RUN_LOG_RESULTS = ["complete", "partial", "blocked", "failed"];

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const cwd = process.cwd();
const config = loadConfig(cwd);
const root = config.root;
const p = getPaths(cwd, root);

const program = new Command();

program
  .name("assignr")
  .description("A repo-native workflow layer for existing coding agents.")
  .version(version);

// init
program
  .command("init")
  .description("Initialize Assignr folder structure in this repo.")
  .option("--force", "Overwrite existing files.", false)
  .option("--root <dir>", "Root directory for Assignr.", DEFAULT_ROOT)
  .action(async (opts: { force: boolean; root: string }) => {
    await initCommand({ force: opts.force, cwd, root: opts.root });
  });

// new
program
  .command("new [title]")
  .description("Create a new task spec.")
  .option("--type <type>", `Task type (${TASK_TYPES.join(", ")})`, "implementation")
  .option("--domain <domain>", "Domain for this task.", "core")
  .option("--priority <priority>", `Priority (${PRIORITIES.join(", ")})`, "medium")
  .option("--goal <goal>", "Pre-fill the goal field.")
  .option("--interactive", "Prompt for task fields.", false)
  .action(async (title: string | undefined, opts: { type: string; domain: string; priority: string; goal?: string; interactive: boolean }) => {
    if (!title && !opts.interactive) {
      console.error("error: missing required argument 'title'");
      process.exit(1);
    }

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
    if (opts.interactive) {
      await newInteractiveCommand(title, { type, domain: opts.domain, priority, goal: opts.goal, cwd, activeDir: p.tasksActive });
      return;
    }
    newCommand(title!, { type, domain: opts.domain, priority, goal: opts.goal, cwd, activeDir: p.tasksActive });
  });

// validate
program
  .command("validate")
  .description("Validate all task specs.")
  .action(() => {
    validateCommand(p.specsTasks, cwd);
  });

// compile
program
  .command("compile [task-id]")
  .description("Compile task specs into markdown prompts.")
  .option("--status <status>", "Compile tasks with this status.")
  .option("--all", "Compile all tasks.", false)
  .action((taskId: string | undefined, opts: { status?: string; all: boolean }) => {
    compileCommand({
      specsTasksDir: p.specsTasks,
      generatedDir: p.promptsGenerated,
      cwd,
      taskId,
      status: opts.status as Status | undefined,
      all: opts.all,
    });
  });

// list
program
  .command("list")
  .description("List task specs in a compact table.")
  .option("--status <status>", "Show only tasks with this exact status (case-sensitive).")
  .option("--domain <domain>", "Show only tasks in this exact domain (case-sensitive).")
  .option("--completed", "Show completed tasks. Mutually exclusive with --archived and --all.")
  .option("--archived", "Show archived tasks. Mutually exclusive with --completed and --all.")
  .option("--all", "Show active, completed, and archived tasks. Mutually exclusive with --completed and --archived.")
  .action((opts: { status?: string; domain?: string; completed?: boolean; archived?: boolean; all?: boolean }) => {
    listCommand(p.specsTasks, cwd, {
      status: opts.status,
      domain: opts.domain,
      completed: opts.completed,
      archived: opts.archived,
      all: opts.all,
    });
  });

// status
program
  .command("status")
  .description("Show task status summary.")
  .action(() => {
    statusCommand(p.specsTasks, cwd);
  });

// set-status
program
  .command("set-status <task-id> <status>")
  .description(`Update task status. Allowed: ${STATUSES.join(", ")}`)
  .action((taskId: string, status: string) => {
    setStatusCommand(taskId, status as Status, p.specsTasks, cwd);
  });

// complete
program
  .command("complete <task-id>")
  .description("Mark an active task complete and move it to tasks/completed.")
  .action((taskId: string) => {
    completeCommand(taskId, {
      specsTasksDir: p.specsTasks,
      completedDir: p.tasksCompleted,
      cwd,
    });
  });

// archive
program
  .command("archive <task-id>")
  .description("Archive an active task and move it to tasks/archived.")
  .action((taskId: string) => {
    archiveCommand(taskId, {
      specsTasksDir: p.specsTasks,
      archivedDir: p.tasksArchived,
      cwd,
    });
  });

// check-lifecycle
program
  .command("check-lifecycle")
  .description("Validate that task files live in the lifecycle directory matching their status.")
  .action(() => {
    checkLifecycleCommand({
      cwd,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
    });
  });

// run-log
program
  .command("run-log <task-id>")
  .description("Create a run log for a task.")
  .option("--result <result>", "Outcome: complete, partial, blocked, or failed.")
  .option("--model <model>", "Model that performed the work.")
  .option("--agent <agent>", "Agent harness or tool used.")
  .option("--harness <harness>", "Agent harness or tool used.")
  .option("--command <command>", "Command executed during the run. May be repeated.", collect, [])
  .option("--commands-run <command>", "Command executed during the run. May be repeated.", collect, [])
  .option("--file <path>", "Changed file path. May be repeated; otherwise git status is used.", collect, [])
  .option("--files-changed <path>", "Changed file path. May be repeated; otherwise git status is used.", collect, [])
  .option("--risks <risks>", "Risks or residual concerns.")
  .option("--notes <notes>", "Free-form notes.")
  .action((taskId: string, opts: {
    result?: string;
    model?: string;
    agent?: string;
    harness?: string;
    command: string[];
    commandsRun: string[];
    file: string[];
    filesChanged: string[];
    risks?: string;
    notes?: string;
  }) => {
    if (opts.result && !RUN_LOG_RESULTS.includes(opts.result)) {
      console.error(`Invalid result: "${opts.result}". Allowed: ${RUN_LOG_RESULTS.join(", ")}`);
      process.exit(1);
    }

    runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd, {
      result: opts.result,
      model: opts.model,
      agent: opts.agent,
      harness: opts.harness,
      commandsRun: [...opts.command, ...opts.commandsRun],
      filesChanged: [...opts.file, ...opts.filesChanged],
      risks: opts.risks,
      notes: opts.notes,
    });
  });

// review
program
  .command("review <task-id>")
  .description("Generate a review prompt for a task.")
  .action((taskId: string) => {
    reviewCommand(taskId, p.specsTasks, p.promptsGenerated, cwd);
  });

// doctor
program
  .command("doctor")
  .description("Check whether this repo is configured correctly for Assignr.")
  .action(() => {
    doctorCommand(cwd, root);
  });

// mcp-config
program
  .command("mcp-config")
  .description("Create or update .mcp.json for the Assignr MCP server.")
  .option("--force", "Overwrite an existing assignr MCP server entry.", false)
  .action((opts: { force: boolean }) => {
    mcpConfigCommand({ cwd, force: opts.force });
  });

program.parse(process.argv);
