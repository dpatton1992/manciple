import type { Command } from "commander";
import type { Status } from "../constants.js";
import { runLogCommand } from "./runLog.js";
import { setStatusCommand } from "./setStatus.js";
import { completeCommand } from "./complete.js";
import type { AssignrPaths } from "../utils/paths.js";

const RUN_LOG_RESULTS = ["complete", "partial", "blocked", "failed"];

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export function registerSubmitCommand(program: Command, p: AssignrPaths, cwd: string): void {
  program
    .command("submit <task-id>")
    .description("Submit a task with a run log and result.")
    .option("--result <result>", `Outcome (${RUN_LOG_RESULTS.join(", ")}).`)
    .option("--blocked", "Mark as blocked (shortcut for --result blocked). Requires --reason.", false)
    .option("--complete", "Complete the task (skips review).", false)
    .option("--reason <text>", "Reason for blocking or failure.")
    .option("--agent <agent>", "Agent harness or tool used.")
    .option("--model <model>", "Model that performed the work.")
    .option("--follow-up <text>", "Follow-up note. May be repeated.", collect, [])
    .option("--decision <text>", "Decision made. May be repeated.", collect, [])
    .option("--verify-receipt <text>", "Verification receipt.")
    .option("--acceptance-evidence <evidence>", "Acceptance criteria evidence line. May be repeated.", collect, [])
    .option("--risks <risks>", "Risks or residual concerns.")
    .option("--notes <notes>", "Free-form notes.")
    .action((taskId: string, opts: {
      result?: string;
      blocked: boolean;
      complete: boolean;
      reason?: string;
      agent?: string;
      model?: string;
      followUp: string[];
      decision: string[];
      verifyReceipt?: string;
      acceptanceEvidence: string[];
      risks?: string;
      notes?: string;
    }) => {
      let result: string;
      let doComplete = false;
      let targetStatus: string | null = null;

      if (opts.complete) {
        result = "complete";
        doComplete = true;
      } else if (opts.blocked) {
        result = "blocked";
        targetStatus = "blocked";
        if (!opts.reason) {
          console.error("error: --reason is required when using --blocked");
          process.exit(1);
        }
      } else if (opts.result) {
        result = opts.result;
        if (!RUN_LOG_RESULTS.includes(result)) {
          console.error(`Invalid result: "${result}". Allowed: ${RUN_LOG_RESULTS.join(", ")}`);
          process.exit(1);
        }
        if (result === "blocked" && !opts.reason) {
          console.error("error: --reason is required when result is blocked");
          process.exit(1);
        }
      } else {
        console.error("error: one of --result, --blocked, or --complete is required");
        process.exit(1);
      }

      // Create the run log
      runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd, {
        result,
        agent: opts.agent ?? "cli",
        model: opts.model,
        commandsRun: [],
        testsRun: [],
        filesChanged: [],
        decisionsMade: opts.decision,
        risks: opts.risks,
        followUps: opts.followUp,
        acceptanceCriteriaEvidence: opts.acceptanceEvidence,
        verifyReceipt: opts.verifyReceipt,
        notes: opts.notes,
      });

      // Update task status
      if (doComplete) {
        completeCommand(taskId, {
          specsTasksDir: p.specsTasks,
          completedDir: p.tasksCompleted,
          cwd,
        });
      } else if (targetStatus) {
        setStatusCommand(taskId, targetStatus as Status, p.specsTasks, cwd);
      } else if (result === "blocked" || result === "failed" || result === "partial") {
        setStatusCommand(taskId, result as Status, p.specsTasks, cwd);
      } else {
        // result=complete without --complete → needs_review
        setStatusCommand(taskId, "needs_review" as Status, p.specsTasks, cwd);
      }
    });
}
