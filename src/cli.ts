#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { loadConfig } from "./config.js";
import { getPaths } from "./utils/paths.js";
import { DEFAULT_ROOT, STATUSES, TASK_TYPES, PRIORITIES } from "./constants.js";
import { initCommand } from "./commands/init.js";
import { newCommand } from "./commands/new.js";
import { validateCommand } from "./commands/validate.js";
import { compileCommand } from "./commands/compile.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { setStatusCommand } from "./commands/setStatus.js";
import { completeCommand } from "./commands/complete.js";
import { runLogCommand } from "./commands/runLog.js";
import { reviewCommand } from "./commands/review.js";
import { doctorCommand } from "./commands/doctor.js";
import { mcpConfigCommand } from "./commands/mcpConfig.js";
import type { Status, TaskType, Priority } from "./constants.js";

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
  .command("new <title>")
  .description("Create a new task spec.")
  .option("--type <type>", `Task type (${TASK_TYPES.join(", ")})`, "implementation")
  .option("--domain <domain>", "Domain for this task.", "core")
  .option("--priority <priority>", `Priority (${PRIORITIES.join(", ")})`, "medium")
  .option("--goal <goal>", "Pre-fill the goal field.")
  .action((title: string, opts: { type: string; domain: string; priority: string; goal?: string }) => {
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
    newCommand(title, { type, domain: opts.domain, priority, goal: opts.goal, cwd, activeDir: p.tasksActive });
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
  .action((opts: { status?: string; domain?: string }) => {
    listCommand(p.specsTasks, cwd, { status: opts.status, domain: opts.domain });
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

// run-log
program
  .command("run-log <task-id>")
  .description("Create a run log stub for a task.")
  .action((taskId: string) => {
    runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd);
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
