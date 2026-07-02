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
import { formatTaskCommand } from "./commands/formatTask.js";
import { taskPacketCommand } from "./commands/taskPacket.js";
import { listCommand } from "./commands/list.js";
import { plannerContextCommand } from "./commands/plannerContext.js";
import { statusCommand } from "./commands/status.js";
import { setStatusCommand } from "./commands/setStatus.js";
import { completeCommand } from "./commands/complete.js";
import { approveCommand } from "./commands/approve.js";
import { requestChangesCommand } from "./commands/requestChanges.js";
import { blockReviewCommand } from "./commands/blockReview.js";
import { archiveCommand } from "./commands/archive.js";
import { reopenCommand } from "./commands/reopen.js";
import { checkLifecycleCommand } from "./commands/checkLifecycle.js";
import { migrateTasksCommand } from "./commands/migrateTasks.js";
import { runLogCommand } from "./commands/runLog.js";
import { summarizeRunCostCommand } from "./commands/summarizeRunCost.js";
import { tokenEstimateCommand, DEFAULT_TOKEN_BUDGET } from "./commands/tokenEstimate.js";
import { reviewCommand } from "./commands/review.js";
import { reviewCheckCommand } from "./commands/reviewCheck.js";
import { reviewQueueCommand } from "./commands/reviewQueue.js";
import { coordinatorCommand } from "./commands/coordinator.js";
import { dispatchPlanCommand } from "./commands/dispatchPlan.js";
import { worktreeCommand } from "./commands/worktree.js";
import { doctorCommand } from "./commands/doctor.js";
import { mcpConfigCommand } from "./commands/mcpConfig.js";
import { installAssetsCommand } from "./commands/installAssets.js";
import { verifyCommand } from "./commands/verify.js";
import { handoffCommand, handoffQueueCommand } from "./commands/handoff.js";
import type { HandoffContext } from "./commands/handoff.js";
import { registerTaskCommands } from "./commands/task.js";
import { registerSubmitCommand } from "./commands/submit.js";
import {
  checkDefaultCommand,
  checkTasksCommand,
  checkLifecycleSubCommand,
  checkVerifyCommand,
  checkTokensCommand,
  checkCostCommand,
} from "./commands/check.js";
import type { CheckContext } from "./commands/check.js";
import type { Status, TaskType, Priority } from "./constants.js";
import { headerBanner, styleHelpSection } from "./utils/styling.js";

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseNumberOption(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative number, got "${value}".`);
  }
  return parsed;
}

const RUN_LOG_RESULTS = ["complete", "partial", "blocked", "failed"];

// === Deprecation system for legacy commands ===
const DEPRECATED_COMMANDS = new Map<string, string>([
  ["compile", "handoff"],
  ["task-packet", "handoff --packet"],
  ["planner-context", "handoff"],
  ["coordinator", "handoff queue"],
  ["dispatch-plan", "handoff queue --json"],
  ["new", "task new"],
  ["list", "task list"],
  ["set-status", "task start|pause|resume"],
  ["status", "task show"],
  ["archive", "task archive"],
  ["reopen", "task reopen"],
  ["complete", "submit --complete"],
  ["run-log", "submit"],
  ["review-check", "review check"],
  ["review-queue", "review queue"],
  ["approve", "review approve"],
  ["request-changes", "review changes"],
  ["block-review", "review block"],
  ["validate", "check tasks"],
  ["doctor", "check"],
  ["check-lifecycle", "check lifecycle"],
  ["verify", "check verify --profile <profile>"],
  ["token-estimate", "check tokens"],
  ["summarize-run-cost", "check cost"],
]);

const shownDeprecation = new Set<string>();

function emitDeprecation(name: string): void {
  if (!shownDeprecation.has(name)) {
    shownDeprecation.add(name);
    const replacement = DEPRECATED_COMMANDS.get(name);
    if (replacement) {
      console.error(`manciple ${name} -> manciple ${replacement}`);
    }
  }
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const cwd = process.cwd();
const config = loadConfig(cwd);
const root = config.root;
const p = getPaths(cwd, root);

const program = new Command();

program
  .name("manciple")
  .description("A repo-native workflow layer for existing coding agents.")
  .version(version);

program.addHelpText("beforeAll", headerBanner());

// init
program
  .command("init")
  .description("Initialize Manciple folder structure, MCP config, gitignore entries, and packaged agent skills/agents in this repo.")
  .option("--force", "Overwrite existing files.", false)
  .option("--root <dir>", "Root directory for Manciple.", DEFAULT_ROOT)
  .option("--mcp", "Only set up MCP config (.mcp.json), skip directory creation and agents.", false)
  .option("--agents", "Only install packaged agent skills and agents, skip directory creation and MCP.", false)
  .option("--verbose", "Show detailed per-directory and per-file output.", false)
  .action(async (opts: { force: boolean; root: string; mcp: boolean; agents: boolean; verbose: boolean }) => {
    await initCommand({ force: opts.force, cwd, root: opts.root, mcp: opts.mcp, agents: opts.agents, verbose: opts.verbose });
  });

// install-assets
program
  .command("install-assets")
  .description("Copy packaged agent skills (.claude/skills/, .codex/skills/) and OpenCode agents (.opencode/agents/) from node_modules to the repo root.")
  .option("--force", "Overwrite existing files.", false)
  .action((opts: { force: boolean }) => {
    installAssetsCommand({ cwd, force: opts.force });
  });

// new
program
  .command("new [title]")
  .description("Create a new task spec.")
  .option("--type <type>", `Task type (${TASK_TYPES.join(", ")})`, "implementation")
  .option("--domain <domain>", "Domain for this task.", "core")
  .option("--priority <priority>", `Priority (${PRIORITIES.join(", ")})`, "medium")
  .option("--goal <goal>", "Pre-fill the goal field.")
  .option("--implementation-note <note>", "Behavior, product, or design constraint. May be repeated.", collect, [])
  .option("--interactive", "Prompt for task fields.", false)
  .action(async (title: string | undefined, opts: { type: string; domain: string; priority: string; goal?: string; implementationNote: string[]; interactive: boolean }) => {
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
    newCommand(title!, {
      type,
      domain: opts.domain,
      priority,
      goal: opts.goal,
      cwd,
      activeDir: p.tasksActive,
      implementationNotes: opts.implementationNote,
    });
  });

// validate
program
  .command("validate")
  .description("Validate all task specs.")
  .option("--all", "Validate active, completed, and archived tasks.", false)
  .action((opts: { all: boolean }) => {
    validateCommand(p.tasksActive, cwd, { all: opts.all });
  });

// compile
program
  .command("compile [task-id]")
  .description("Compile task specs into markdown prompts.")
  .option("--status <status>", "Compile tasks with this status.")
  .option("--all", "Compile tasks from active, completed, and archived lifecycle directories.", false)
  .action((taskId: string | undefined, opts: { status?: string; all: boolean }) => {
    compileCommand({
      specsTasksDir: p.tasksActive,
      generatedDir: p.promptsGenerated,
      cwd,
      taskId,
      status: opts.status as Status | undefined,
      all: opts.all,
    });
  });

// format-task
program
  .command("format-task <task-id>")
  .description("Check or format one task YAML file by task id.")
  .option("--check", "Check formatting without writing changes.", false)
  .action((taskId: string, opts: { check: boolean }) => {
    formatTaskCommand(taskId, {
      specsTasksDir: p.specsTasks,
      cwd,
      checkOnly: opts.check,
    });
  });

// handoff
const handoff = program
  .command("handoff [task-id]")
  .description("Compile a task prompt, or inspect the worker queue. See `manciple handoff --help`.")
  .option("--packet", "Print compact worker packet instead of compiled prompt.", false)
  .action((taskId: string | undefined, opts: { packet: boolean }) => {
    if (taskId) {
      handoffCommand(taskId, {
        cwd,
        specsTasksDir: p.specsTasks,
        tasksActiveDir: p.tasksActive,
        generatedDir: p.promptsGenerated,
        packet: opts.packet,
      });
    } else {
      handoff.help();
    }
  });

handoff
  .command("queue")
  .description("Show runnable/deferred work (same as `manciple coordinator`). Use --json for dispatch plan (same as `manciple dispatch-plan`).")
  .option("--json", "Print deterministic dispatch packet JSON.", false)
  .action((opts: { json: boolean }) => {
    handoffQueueCommand({
      cwd,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      generatedDir: p.promptsGenerated,
      json: opts.json,
    });
  });

// task-packet
program
  .command("task-packet <task-id>")
  .description("Print a compact bounded worker packet for one task.")
  .action((taskId: string) => {
    taskPacketCommand({
      specsTasksDir: p.specsTasks,
      cwd,
      taskId,
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

// planner-context
program
  .command("planner-context")
  .description("Print a compact bounded task index for planning agents.")
  .option("--status <status>", "Show only tasks with this exact status (case-sensitive).")
  .option("--domain <domain>", "Show only tasks in this exact domain (case-sensitive).")
  .option("--completed", "Include completed lifecycle tasks instead of active tasks.")
  .option("--archived", "Include archived lifecycle tasks instead of active tasks.")
  .option("--all", "Include active, completed, and archived lifecycle tasks.")
  .option("--max-chars <count>", "Warn and truncate generated context above this character budget.", parseNumberOption)
  .option("--max-tokens <count>", "Warn and truncate generated context above this estimated token budget.", parseNumberOption)
  .option("--strict", "Exit with status 1 when the requested budget truncates planner context.", false)
  .action((opts: {
    status?: string;
    domain?: string;
    completed?: boolean;
    archived?: boolean;
    all?: boolean;
    maxChars?: number;
    maxTokens?: number;
    strict?: boolean;
  }) => {
    plannerContextCommand(p.specsTasks, cwd, {
      status: opts.status,
      domain: opts.domain,
      completed: opts.completed,
      archived: opts.archived,
      all: opts.all,
      maxChars: opts.maxChars,
      maxTokens: opts.maxTokens,
      strict: opts.strict,
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

// approve
program
  .command("approve <task-id>")
  .description("Approve a task in needs_review, record the outcome, and move it to tasks/completed.")
  .action((taskId: string) => {
    approveCommand(taskId, {
      specsTasksDir: p.specsTasks,
      completedDir: p.tasksCompleted,
      runsDir: p.runs,
      cwd,
    });
  });

// request-changes
program
  .command("request-changes <task-id>")
  .description("Request changes for a task in needs_review and return it to in_progress.")
  .requiredOption("--reason <text>", "Reason changes are required.")
  .action((taskId: string, opts: { reason: string }) => {
    requestChangesCommand(taskId, opts.reason, {
      specsTasksDir: p.specsTasks,
      runsDir: p.runs,
      cwd,
    });
  });

// block-review
program
  .command("block-review <task-id>")
  .description("Block review for a task in needs_review and record the blocking reason.")
  .requiredOption("--reason <text>", "Reason review is blocked.")
  .action((taskId: string, opts: { reason: string }) => {
    blockReviewCommand(taskId, opts.reason, {
      specsTasksDir: p.specsTasks,
      runsDir: p.runs,
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

// reopen
program
  .command("reopen <task-id>")
  .description("Reopen a completed or archived task, searching completed first, and move it to tasks/active.")
  .action((taskId: string) => {
    reopenCommand(taskId, {
      specsTasksDir: p.specsTasks,
      activeDir: p.tasksActive,
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

// check
const check = program
  .command("check")
  .description("Health summary, validation, lifecycle check, and diagnostics. See `manciple check --help`.")
  .action(() => {
    checkDefaultCommand({
      cwd,
      root,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      tasksCompletedDir: p.tasksCompleted,
      tasksArchivedDir: p.tasksArchived,
      runsDir: p.runs,
      generatedDir: p.promptsGenerated,
    });
  });

check
  .command("tasks")
  .description("Validate all task specs (same as `manciple validate`).")
  .action(() => {
    checkTasksCommand({
      cwd,
      root,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      tasksCompletedDir: p.tasksCompleted,
      tasksArchivedDir: p.tasksArchived,
      runsDir: p.runs,
      generatedDir: p.promptsGenerated,
    });
  });

check
  .command("lifecycle")
  .description("Run lifecycle placement check (same as `manciple check-lifecycle`).")
  .action(() => {
    checkLifecycleSubCommand({
      cwd,
      root,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      tasksCompletedDir: p.tasksCompleted,
      tasksArchivedDir: p.tasksArchived,
      runsDir: p.runs,
      generatedDir: p.promptsGenerated,
    });
  });

check
  .command("verify")
  .description("Run verification (same as `manciple verify`).")
  .requiredOption("--profile <profile>", "Verification profile: coordinator, worker, or review.")
  .action(async (opts: { profile: string }) => {
    await checkVerifyCommand(opts.profile, cwd);
  });

check
  .command("tokens <task-id>")
  .description("Estimate token usage for a task (same as `manciple token-estimate`).")
  .action((taskId: string) => {
    checkTokensCommand({
      cwd,
      root,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      tasksCompletedDir: p.tasksCompleted,
      tasksArchivedDir: p.tasksArchived,
      runsDir: p.runs,
      generatedDir: p.promptsGenerated,
    }, taskId);
  });

check
  .command("cost")
  .description("Summarize run costs (same as `manciple summarize-run-cost`).")
  .action(() => {
    checkCostCommand({
      cwd,
      root,
      specsTasksDir: p.specsTasks,
      tasksActiveDir: p.tasksActive,
      tasksCompletedDir: p.tasksCompleted,
      tasksArchivedDir: p.tasksArchived,
      runsDir: p.runs,
      generatedDir: p.promptsGenerated,
    });
  });

// migrate-tasks
program
  .command("migrate-tasks")
  .description("One-time migration: copy legacy specs/tasks task files into lifecycle directories.")
  .action(async () => {
    await migrateTasksCommand({
      specsTasksDir: p.specsTasks,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
      cwd,
    });
  });

// run-log
program
  .command("run-log <task-id>")
  .description("Create a run log for a task.")
  .option("--result <result>", "Outcome: complete, partial, blocked, or failed.")
  .option("--task-status <status>", `Final task status to record. Allowed: ${STATUSES.join(", ")}.`)
  .option("--model <model>", "Model that performed the work.")
  .option("--agent <agent>", "Agent harness or tool used.")
  .option("--harness <harness>", "Agent harness or tool used.")
  .option("--input-tokens <count>", "Input token count recorded by the agent or harness.", parseNumberOption)
  .option("--output-tokens <count>", "Output token count recorded by the agent or harness.", parseNumberOption)
  .option("--total-tokens <count>", "Total token count recorded by the agent or harness.", parseNumberOption)
  .option("--cost-usd <amount>", "Run cost in USD recorded by the agent or harness.", parseNumberOption)
  .option("--command <command>", "Command executed during the run. May be repeated.", collect, [])
  .option("--commands-run <command>", "Command executed during the run. May be repeated.", collect, [])
  .option("--test <command>", "Test command or test receipt executed during the run. May be repeated.", collect, [])
  .option("--tests-run <command>", "Test command or test receipt executed during the run. May be repeated.", collect, [])
  .option("--file <path>", "Changed file path. May be repeated; otherwise git status is used.", collect, [])
  .option("--files-changed <path>", "Changed file path. May be repeated; otherwise git status is used.", collect, [])
  .option("--acceptance-evidence <evidence>", "Acceptance criteria evidence line. May be repeated.", collect, [])
  .option("--verify-receipt <receipt>", "Deterministic verify receipt text or compact JSON.")
  .option("--decision <decision>", "Decision made during the run. May be repeated.", collect, [])
  .option("--follow-up <followUp>", "Follow-up task or note. May be repeated.", collect, [])
  .option("--risks <risks>", "Risks or residual concerns.")
  .option("--notes <notes>", "Free-form notes.")
  .action((taskId: string, opts: {
    result?: string;
    taskStatus?: string;
    model?: string;
    agent?: string;
    harness?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    command: string[];
    commandsRun: string[];
    test: string[];
    testsRun: string[];
    file: string[];
    filesChanged: string[];
    acceptanceEvidence: string[];
    verifyReceipt?: string;
    decision: string[];
    followUp: string[];
    risks?: string;
    notes?: string;
  }) => {
    if (opts.result && !RUN_LOG_RESULTS.includes(opts.result)) {
      console.error(`Invalid result: "${opts.result}". Allowed: ${RUN_LOG_RESULTS.join(", ")}`);
      process.exit(1);
    }
    if (opts.taskStatus && !STATUSES.includes(opts.taskStatus as Status)) {
      console.error(`Invalid task status: "${opts.taskStatus}". Allowed: ${STATUSES.join(", ")}`);
      process.exit(1);
    }

    runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd, {
      result: opts.result,
      taskStatus: opts.taskStatus,
      model: opts.model,
      agent: opts.agent,
      harness: opts.harness,
      inputTokens: opts.inputTokens,
      outputTokens: opts.outputTokens,
      totalTokens: opts.totalTokens,
      costUsd: opts.costUsd,
      commandsRun: [...opts.command, ...opts.commandsRun],
      testsRun: [...opts.test, ...opts.testsRun],
      filesChanged: [...opts.file, ...opts.filesChanged],
      decisionsMade: opts.decision,
      followUps: opts.followUp,
      acceptanceCriteriaEvidence: opts.acceptanceEvidence,
      verifyReceipt: opts.verifyReceipt,
      risks: opts.risks,
      notes: opts.notes,
    });
  });

// summarize-run-cost
program
  .command("summarize-run-cost [task-id]")
  .description("Summarize recorded run-log model, token, and cost evidence.")
  .action((taskId: string | undefined) => {
    summarizeRunCostCommand(p.runs, taskId);
  });

// token-estimate
program
  .command("token-estimate <task-id>")
  .description("Estimate Manciple handoff prompt size using a deterministic local heuristic.")
  .option("--budget <tokens>", "Estimated-token budget for risk reporting.", parseNumberOption, DEFAULT_TOKEN_BUDGET)
  .option("--include-review", "Include generated review prompt estimate.", false)
  .option("--include-run-log", "Include latest run log estimate.", false)
  .option("--include-diff", "Include git diff estimate.", false)
  .option("--include-git-context", "Include compact git status context estimate.", false)
  .option("--append-run-log", "Append the token-estimate section to the latest existing run log.", false)
  .action((taskId: string, opts: {
    budget: number;
    includeReview: boolean;
    includeRunLog: boolean;
    includeDiff: boolean;
    includeGitContext: boolean;
    appendRunLog: boolean;
  }) => {
    tokenEstimateCommand({
      specsTasksDir: p.specsTasks,
      cwd,
      taskId,
      budget: opts.budget,
      includeReview: opts.includeReview,
      includeRunLog: opts.includeRunLog,
      includeDiff: opts.includeDiff,
      includeGitContext: opts.includeGitContext,
      appendRunLog: opts.appendRunLog,
    });
  });

// review command group
const review = program
  .command("review [task-id]")
  .description("Manage the review process. See `manciple review --help` for subcommands.")
  .option("--include-run-log", "Include full latest run log content.", false)
  .option("--include-diff", "Include full git diff content.", false)
  .action((taskId: string | undefined, opts: { includeRunLog: boolean; includeDiff: boolean }) => {
    if (taskId) {
      // Backward compat: `manciple review <task-id>` => same as `review prompt <task-id>`
      reviewCommand(taskId, p.specsTasks, p.promptsGenerated, cwd, {
        includeRunLog: opts.includeRunLog,
        includeGitDiff: opts.includeDiff,
      });
    } else {
      review.help();
    }
  });

review
  .command("queue")
  .description("Run review queue triage (same as `manciple review-queue`).")
  .option("--mode <mode>", "Review queue mode: triage or deep.", "triage")
  .option("--all", "In deep mode, include tasks that passed triage.", false)
  .option("--budget <tokens>", "Positive integer review budget estimate for queued packets.")
  .option("--deep-only <filter>", "In deep mode, emit only tasks matching the filter: risky.")
  .option("--machine", "Tab-delimited output for backward compatibility.", false)
  .action((opts: { mode: string; all: boolean; budget?: string; deepOnly?: string; machine: boolean }) => {
    reviewQueueCommand(p.tasksActive, cwd, {
      mode: opts.mode as "triage" | "deep",
      all: opts.all,
      budget: opts.budget,
      deepOnly: opts.deepOnly,
      machine: opts.machine,
      generatedDir: p.promptsGenerated,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
    });
  });

review
  .command("check [task-id]")
  .description("Check review readiness (same as `manciple review-check`).")
  .option("--deterministic", "Run local deterministic review gate checks.", false)
  .option("--machine", "Tab-delimited output for backward compatibility.", false)
  .action((taskId: string | undefined, opts: { deterministic: boolean; machine: boolean }) => {
    reviewCheckCommand(p.tasksActive, cwd, taskId, {
      deterministic: opts.deterministic,
      machine: opts.machine,
      generatedDir: p.promptsGenerated,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
    });
  });

review
  .command("prompt <task-id>")
  .description("Generate a review prompt (same as `manciple review <task-id>`).")
  .option("--include-run-log", "Include full latest run log content.", false)
  .option("--include-diff", "Include full git diff content.", false)
  .action((taskId: string, opts: { includeRunLog: boolean; includeDiff: boolean }) => {
    reviewCommand(taskId, p.specsTasks, p.promptsGenerated, cwd, {
      includeRunLog: opts.includeRunLog,
      includeGitDiff: opts.includeDiff,
    });
  });

review
  .command("approve <task-id>")
  .description("Approve and complete a task (same as `manciple approve`).")
  .action((taskId: string) => {
    approveCommand(taskId, {
      specsTasksDir: p.specsTasks,
      completedDir: p.tasksCompleted,
      runsDir: p.runs,
      cwd,
    });
  });

review
  .command("changes <task-id>")
  .description("Request changes and return task to in_progress (same as `manciple request-changes`).")
  .requiredOption("--reason <text>", "Reason changes are required.")
  .action((taskId: string, opts: { reason: string }) => {
    requestChangesCommand(taskId, opts.reason, {
      specsTasksDir: p.specsTasks,
      runsDir: p.runs,
      cwd,
    });
  });

review
  .command("block <task-id>")
  .description("Block review for a task (same as `manciple block-review`).")
  .requiredOption("--reason <text>", "Reason review is blocked.")
  .action((taskId: string, opts: { reason: string }) => {
    blockReviewCommand(taskId, opts.reason, {
      specsTasksDir: p.specsTasks,
      runsDir: p.runs,
      cwd,
    });
  });

// review-check
program
  .command("review-check [task-id]")
  .description("Check review readiness evidence for active needs_review tasks.")
  .option("--deterministic", "Run local deterministic review gate checks.", false)
  .option("--machine", "Tab-delimited output for backward compatibility.", false)
  .action((taskId: string | undefined, opts: { deterministic: boolean; machine: boolean }) => {
    reviewCheckCommand(p.tasksActive, cwd, taskId, {
      deterministic: opts.deterministic,
      machine: opts.machine,
      generatedDir: p.promptsGenerated,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
    });
  });

// review-queue
program
  .command("review-queue")
  .description("Triage active needs_review tasks for deeper review.")
  .option("--mode <mode>", "Review queue mode: triage or deep.", "triage")
  .option("--all", "In deep mode, include tasks that passed triage.", false)
  .option("--budget <tokens>", "Positive integer review budget estimate for queued packets.")
  .option("--deep-only <filter>", "In deep mode, emit only tasks matching the filter: risky.")
  .option("--machine", "Tab-delimited output for backward compatibility.", false)
  .action((opts: { mode: string; all: boolean; budget?: string; deepOnly?: string; machine: boolean }) => {
    reviewQueueCommand(p.tasksActive, cwd, {
      mode: opts.mode as "triage" | "deep",
      all: opts.all,
      budget: opts.budget,
      deepOnly: opts.deepOnly,
      machine: opts.machine,
      generatedDir: p.promptsGenerated,
      activeDir: p.tasksActive,
      completedDir: p.tasksCompleted,
      archivedDir: p.tasksArchived,
    });
  });

// coordinator
program
  .command("coordinator")
  .description("Show the owner queue for runnable, waiting, review, complete-ready, blocked, and rework tasks.")
  .action(() => {
    coordinatorCommand(p.specsTasks, cwd);
  });

// dispatch-plan
program
  .command("dispatch-plan")
  .description("Print a deterministic coordinator dispatch packet as JSON.")
  .action(() => {
    dispatchPlanCommand(p.specsTasks, cwd);
  });

// verify
program
  .command("verify")
  .description("Run a deterministic verification profile.")
  .requiredOption("--profile <profile>", "Verification profile: coordinator, worker, or review.")
  .action(async (opts: { profile?: string }) => {
    await verifyCommand(opts.profile, cwd);
  });

// worktree
program
  .command("worktree <task-id>")
  .description("Create or report a task-specific git worktree under .manciple/worktrees/.")
  .option("--force", "Remove a non-empty existing path before creating the task worktree.", false)
  .action((taskId: string, opts: { force: boolean }) => {
    worktreeCommand(taskId, {
      cwd,
      worktreesDir: p.worktrees,
      force: opts.force,
    });
  });

// doctor
program
  .command("doctor")
  .description("Check whether this repo is configured correctly for Manciple.")
  .action(() => {
    doctorCommand(cwd, root);
  });

// mcp-config
program
  .command("mcp-config")
  .description("Create or update .mcp.json for the Manciple MCP server.")
  .option("--force", "Overwrite an existing manciple MCP server entry.", false)
  .action((opts: { force: boolean }) => {
    mcpConfigCommand({ cwd, force: opts.force });
  });

// task command group
registerTaskCommands(program, p, cwd);

// submit command
registerSubmitCommand(program, p, cwd);

// === Hide non-primary commands and add deprecation hints ===
const PRIMARY_COMMANDS = new Set(["init", "task", "handoff", "submit", "review", "check"]);

for (const cmd of program.commands) {
  const name = cmd.name();
  if (name === "help") continue; // preserve built-in help command
  if (!PRIMARY_COMMANDS.has(name)) {
    (cmd as any)._hidden = true;
    const replacement = DEPRECATED_COMMANDS.get(name);
    if (replacement) {
      const origAction = (cmd as any)._actionHandler;
      if (origAction) {
        (cmd as any)._actionHandler = function (...args: unknown[]) {
          emitDeprecation(name);
          return origAction.apply(this, args);
        };
      }
    }
  }
}

// === Help customization: detect --all flag to show hidden commands ===
const showAllCommands = process.argv.slice(2).includes("--all");

const origHelpInformation = program.helpInformation.bind(program);
program.helpInformation = () => {
  // Temporarily unhide legacy commands when --all is active
  const toggled: Command[] = [];
  if (showAllCommands) {
    for (const cmd of program.commands) {
      if ((cmd as any)._hidden) {
        (cmd as any)._hidden = false;
        toggled.push(cmd);
      }
    }
  }

  let help = origHelpInformation();

  // Restore hidden state
  for (const cmd of toggled) {
    (cmd as any)._hidden = true;
  }

  if (showAllCommands) {
    help = help.replace("Commands:", "All commands (primary and legacy):");

    // Append legacy command examples to the help footer
    help += "\nLegacy command examples:\n";
    for (const [old, replacement] of DEPRECATED_COMMANDS) {
      help += `  manciple ${old.padEnd(20)} → manciple ${replacement}\n`;
    }
  } else {
    help += "\nRun `manciple --help --all` to show all commands, including legacy/deprecated ones.\n";
  }

  // Colorize section headings.
  // styleHelpSection handles NO_COLOR internally via picocolors.
  const sections = [
    "All commands (primary and legacy):",
    "Commands:",
    "Options:",
    "Examples:",
    "Notes:",
  ];
  for (const section of sections) {
    help = help.replace(section, styleHelpSection(section));
  }

  return help;
};

// Filter --all from argv before parsing so commander does not error on unknown option
const filteredArgv = process.argv.filter((a) => a !== "--all");
program.parse(filteredArgv);
