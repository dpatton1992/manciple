import { compileCommand } from "./compile.js";
import type { CompileOptions } from "./compile.js";
import { taskPacketCommand } from "./taskPacket.js";
import type { TaskPacketCommandOptions } from "./taskPacket.js";
import { coordinatorCommand } from "./coordinator.js";
import { dispatchPlanCommand } from "./dispatchPlan.js";

export interface HandoffContext {
  cwd: string;
  specsTasksDir: string;
  tasksActiveDir: string;
  generatedDir: string;
}

/**
 * `assignr handoff <task-id>` — compile prompt
 * `assignr handoff <task-id> --packet` — compact worker packet
 */
export function handoffCommand(
  taskId: string,
  ctx: HandoffContext & { packet?: boolean }
): void {
  if (ctx.packet) {
    taskPacketCommand({
      specsTasksDir: ctx.specsTasksDir,
      cwd: ctx.cwd,
      taskId,
    });
  } else {
    compileCommand({
      specsTasksDir: ctx.tasksActiveDir,
      generatedDir: ctx.generatedDir,
      cwd: ctx.cwd,
      taskId,
    });
  }
}

/**
 * `assignr handoff queue` — coordinator queue
 * `assignr handoff queue --json` — dispatch plan JSON
 */
export function handoffQueueCommand(ctx: HandoffContext & { json?: boolean }): void {
  if (ctx.json) {
    dispatchPlanCommand(ctx.specsTasksDir, ctx.cwd);
  } else {
    coordinatorCommand(ctx.specsTasksDir, ctx.cwd);
  }
}
