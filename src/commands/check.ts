import { doctorCommand } from "./doctor.js";
import { validateCommand } from "./validate.js";
import { checkLifecycleCommand } from "./checkLifecycle.js";
import type { CheckLifecycleCommandOptions } from "./checkLifecycle.js";
import { verifyCommand } from "./verify.js";
import { tokenEstimateCommand } from "./tokenEstimate.js";
import type { TokenEstimateOptions } from "./tokenEstimate.js";
import { summarizeRunCostCommand } from "./summarizeRunCost.js";

export interface CheckContext {
  cwd: string;
  root: string;
  specsTasksDir: string;
  tasksActiveDir: string;
  tasksCompletedDir: string;
  tasksArchivedDir: string;
  runsDir: string;
  generatedDir: string;
}

/**
 * `assignr check` — runs doctor + validate + lifecycle check in sequence
 */
export function checkDefaultCommand(ctx: CheckContext): void {
  doctorCommand(ctx.cwd, ctx.root);
  console.log();
  validateCommand(ctx.tasksActiveDir, ctx.cwd);
  console.log();
  checkLifecycleCommand({
    cwd: ctx.cwd,
    activeDir: ctx.tasksActiveDir,
    completedDir: ctx.tasksCompletedDir,
    archivedDir: ctx.tasksArchivedDir,
  });
}

/**
 * `assignr check tasks` — validate all task specs
 */
export function checkTasksCommand(ctx: CheckContext): void {
  validateCommand(ctx.tasksActiveDir, ctx.cwd);
}

/**
 * `assignr check lifecycle` — lifecycle placement check
 */
export function checkLifecycleSubCommand(ctx: CheckContext): void {
  checkLifecycleCommand({
    cwd: ctx.cwd,
    activeDir: ctx.tasksActiveDir,
    completedDir: ctx.tasksCompletedDir,
    archivedDir: ctx.tasksArchivedDir,
  });
}

/**
 * `assignr check verify --profile <profile>` — run verification
 */
export function checkVerifyCommand(profile: string, cwd: string): Promise<void> {
  return verifyCommand(profile, cwd);
}

/**
 * `assignr check tokens <task-id>` — token estimate
 */
export function checkTokensCommand(ctx: CheckContext, taskId: string): void {
  tokenEstimateCommand({
    specsTasksDir: ctx.specsTasksDir,
    cwd: ctx.cwd,
    taskId,
  });
}

/**
 * `assignr check cost` — summarize run costs
 */
export function checkCostCommand(ctx: CheckContext): void {
  summarizeRunCostCommand(ctx.runsDir);
}
