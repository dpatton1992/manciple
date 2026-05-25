import type { LoadedTaskWithTier } from "../specs/loadTasks.js";

export type CoordinatorSection =
  | "runnable"
  | "waiting"
  | "needs_review"
  | "complete_ready"
  | "blocked"
  | "rework_needed";

export interface CoordinatorQueueRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  section: CoordinatorSection;
  reason: string;
}

export interface CoordinatorQueue {
  runnable: CoordinatorQueueRow[];
  waiting: CoordinatorQueueRow[];
  needsReview: CoordinatorQueueRow[];
  completeReady: CoordinatorQueueRow[];
  blocked: CoordinatorQueueRow[];
  reworkNeeded: CoordinatorQueueRow[];
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const USABLE_DEP_STATUSES = new Set(["needs_review", "complete"]);
const ACTIVE_WORK_STATUSES = new Set(["pending", "in_progress"]);

function normalizePathPattern(pattern: string): string {
  return pattern.trim().replace(/^\.\//, "").replace(/\\/g, "/");
}

function fixedPrefix(pattern: string): string {
  const normalized = normalizePathPattern(pattern);
  const wildcardIndex = normalized.search(/[*?[\]{}]/);
  if (wildcardIndex === -1) {
    return normalized.endsWith("/") ? normalized : normalized;
  }

  const prefix = normalized.slice(0, wildcardIndex);
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash === -1 ? "" : prefix.slice(0, lastSlash + 1);
}

function isDirectoryPattern(pattern: string): boolean {
  const normalized = normalizePathPattern(pattern);
  return normalized.endsWith("/") || normalized.endsWith("/**") || normalized.endsWith("/*");
}

function pathPatternsMayOverlap(first: string, second: string): boolean {
  const a = normalizePathPattern(first);
  const b = normalizePathPattern(second);

  if (!a || !b) return false;
  if (a === b || a === "**" || b === "**") return true;

  const aPrefix = fixedPrefix(a);
  const bPrefix = fixedPrefix(b);
  if (!aPrefix || !bPrefix) return true;

  if (a.includes("*") || a.includes("?") || b.includes("*") || b.includes("?")) {
    return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
  }

  if (isDirectoryPattern(a) || isDirectoryPattern(b)) {
    return a.startsWith(b) || b.startsWith(a);
  }

  return false;
}

function sortTasks(tasks: LoadedTaskWithTier[]): LoadedTaskWithTier[] {
  return [...tasks].sort((a, b) => {
    const statusDiff = Number(b.spec.status === "in_progress") - Number(a.spec.status === "in_progress");
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff =
      (PRIORITY_ORDER[b.spec.priority ?? "medium"] ?? 2) -
      (PRIORITY_ORDER[a.spec.priority ?? "medium"] ?? 2);
    if (priorityDiff !== 0) return priorityDiff;
    return a.spec.id.localeCompare(b.spec.id);
  });
}

function row(task: LoadedTaskWithTier, section: CoordinatorSection, reason: string): CoordinatorQueueRow {
  return {
    id: task.spec.id,
    title: task.spec.title,
    status: task.spec.status,
    priority: task.spec.priority ?? "medium",
    section,
    reason,
  };
}

function isDependencyUsable(task: LoadedTaskWithTier | undefined): boolean {
  return Boolean(task && USABLE_DEP_STATUSES.has(task.spec.status));
}

function taskPaths(task: LoadedTaskWithTier): string[] {
  const ownership = task.spec.path_ownership;
  return [
    ...(task.spec.allowed_paths ?? []),
    ...(ownership.touched_paths ?? []),
    ...(ownership.locked_paths ?? []),
    ...(ownership.unsafe_parallel_areas ?? []),
  ];
}

function overlapReason(task: LoadedTaskWithTier, others: LoadedTaskWithTier[]): string {
  const paths = taskPaths(task);
  if (paths.length === 0) return "";

  for (const other of others) {
    const otherPaths = taskPaths(other);
    for (const path of paths) {
      for (const otherPath of otherPaths) {
        if (pathPatternsMayOverlap(path, otherPath)) {
          return `path overlap with ${other.spec.id}: ${path} <-> ${otherPath}`;
        }
      }
    }
  }

  return "";
}

function explicitConflictReason(task: LoadedTaskWithTier, others: LoadedTaskWithTier[]): string {
  for (const other of others) {
    const taskConflicts = task.spec.conflicts_with ?? [];
    const otherConflicts = other.spec.conflicts_with ?? [];
    if (taskConflicts.includes(other.spec.id) || otherConflicts.includes(task.spec.id)) {
      return `explicit conflict with ${other.spec.id}`;
    }
  }

  return "";
}

function dependencyWaitReasons(
  task: LoadedTaskWithTier,
  taskById: Map<string, LoadedTaskWithTier>
): string[] {
  const reasons: string[] = [];
  const unresolvedDeps = (task.spec.depends_on ?? []).filter(
    (dep) => !isDependencyUsable(taskById.get(dep))
  );

  if (unresolvedDeps.length > 0) {
    reasons.push(`waiting on dependencies: ${unresolvedDeps.join(", ")}`);
  }

  const activeBlockers = [...taskById.values()].filter(
    (other) =>
      other.spec.id !== task.spec.id &&
      other.tier === "active" &&
      !isDependencyUsable(other) &&
      (other.spec.blocks ?? []).includes(task.spec.id)
  );

  if (activeBlockers.length > 0) {
    reasons.push(`blocked by: ${activeBlockers.map((blocker) => blocker.spec.id).join(", ")}`);
  }

  return reasons;
}

function reviewNeedsReworkReason(
  task: LoadedTaskWithTier,
  activeWork: LoadedTaskWithTier[],
  taskById: Map<string, LoadedTaskWithTier>
): string {
  const waitReasons = dependencyWaitReasons(task, taskById);
  if (waitReasons.length > 0) return waitReasons.join("; ");

  const conflict = explicitConflictReason(task, activeWork);
  if (conflict) return conflict;

  return overlapReason(task, activeWork);
}

export function buildCoordinatorQueue(tasks: LoadedTaskWithTier[]): CoordinatorQueue {
  const activeTasks = tasks.filter((task) => task.tier === "active");
  const taskById = new Map(tasks.map((task) => [task.spec.id, task]));
  const queue: CoordinatorQueue = {
    runnable: [],
    waiting: [],
    needsReview: [],
    completeReady: [],
    blocked: [],
    reworkNeeded: [],
  };

  const activeWork = activeTasks.filter((task) => ACTIVE_WORK_STATUSES.has(task.spec.status));
  const selectedRunnable: LoadedTaskWithTier[] = [];

  for (const task of sortTasks(activeTasks)) {
    if (task.spec.status === "blocked") {
      queue.blocked.push(row(task, "blocked", "blocked status"));
      continue;
    }

    if (task.spec.status === "partial" || task.spec.status === "failed") {
      queue.reworkNeeded.push(row(task, "rework_needed", `${task.spec.status} status`));
      continue;
    }

    if (task.spec.status === "complete") {
      queue.completeReady.push(row(task, "complete_ready", "ready to move to completed lifecycle"));
      continue;
    }

    if (task.spec.status === "needs_review") {
      const reason = reviewNeedsReworkReason(task, activeWork, taskById);
      if (reason) {
        queue.reworkNeeded.push(row(task, "rework_needed", reason));
      } else {
        queue.needsReview.push(row(task, "needs_review", "ready for owner review"));
      }
      continue;
    }

    if (!ACTIVE_WORK_STATUSES.has(task.spec.status)) {
      continue;
    }

    const waitReasons = dependencyWaitReasons(task, taskById);
    if (waitReasons.length > 0) {
      queue.waiting.push(row(task, "waiting", waitReasons.join("; ")));
      continue;
    }

    const explicitConflict = explicitConflictReason(task, selectedRunnable);
    if (explicitConflict) {
      queue.waiting.push(row(task, "waiting", explicitConflict));
      continue;
    }

    const pathConflict = overlapReason(task, selectedRunnable);
    if (pathConflict) {
      queue.waiting.push(row(task, "waiting", pathConflict));
      continue;
    }

    if (selectedRunnable.length > 0 && !task.spec.can_run_independently) {
      queue.waiting.push(row(task, "waiting", "not marked can_run_independently"));
      continue;
    }

    selectedRunnable.push(task);
    queue.runnable.push(
      row(
        task,
        "runnable",
        task.spec.can_run_independently ? "dependencies usable; parallel-safe" : "dependencies usable; run as a single slice"
      )
    );
  }

  return queue;
}
