import { loadTasks } from "../specs/loadTasks.js";
import { validateTasks } from "../specs/validateTasks.js";
import { STATUSES } from "../constants.js";
import type { Status } from "../constants.js";
import type { LoadedTask } from "../specs/schema.js";

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

function findNextTask(tasks: LoadedTask[]): {
  task: LoadedTask | null;
  reason: string;
} {
  const completedIds = new Set(
    tasks.filter((t) => t.spec.status === "complete").map((t) => t.spec.id)
  );

  const priorities: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const pending = tasks
    .filter((t) => t.spec.status === "pending")
    .sort(
      (a, b) =>
        (priorities[b.spec.priority ?? "medium"] ?? 2) -
        (priorities[a.spec.priority ?? "medium"] ?? 2)
    );

  for (const candidate of pending) {
    const deps = candidate.spec.depends_on ?? [];
    const blockedDeps = deps.filter((d) => !completedIds.has(d));
    if (blockedDeps.length === 0) {
      return { task: candidate, reason: "" };
    }
  }

  if (pending.length > 0) {
    const first = pending[0];
    const blockedDeps = (first.spec.depends_on ?? []).filter(
      (d) => !completedIds.has(d)
    );
    return {
      task: first,
      reason: `Blocked by unresolved dependencies: ${blockedDeps.join(", ")}`,
    };
  }

  return { task: null, reason: "No pending tasks." };
}

export function statusCommand(specsTasksDir: string, cwd: string): void {
  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(
      `  ⚠ ${errors.length} task file(s) could not be loaded (run "assignr validate" for details).`
    );
  }

  const counts: Record<Status, number> = {
    pending: 0,
    in_progress: 0,
    needs_review: 0,
    complete: 0,
    blocked: 0,
    failed: 0,
    partial: 0,
  };

  for (const { spec } of tasks) {
    counts[spec.status] = (counts[spec.status] ?? 0) + 1;
  }

  console.log("Assignr Status");
  console.log("────────────────");
  for (const status of STATUSES) {
    console.log(`  ${pad(status + ":", 14)} ${counts[status]}`);
  }

  const { task: next, reason } = findNextTask(tasks);
  console.log("\nNext suggested task:");
  if (next) {
    console.log(`  ${next.spec.id} [${next.spec.priority ?? "medium"}]`);
    if (reason) {
      console.log(`  ⚠ ${reason}`);
    }
  } else {
    console.log(`  ${reason || "None."}`);
  }
}
