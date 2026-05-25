import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";

import { coordinatorCommand } from "../src/commands/coordinator.js";
import { buildCoordinatorQueue } from "../src/coordination/reviewQueue.js";
import { initCommand } from "../src/commands/init.js";
import { loadTasks } from "../src/specs/loadTasks.js";
import { getPaths } from "../src/utils/paths.js";
import type { TaskSpec } from "../src/specs/schema.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "assignr-coordinator-"));
  p = getPaths(cwd, ".assignr");
  await initCommand({ force: false, cwd, root: ".assignr" });
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeTask(id: string, overrides: Partial<TaskSpec> = {}): void {
  const task: TaskSpec = {
    id,
    title: id,
    status: "pending",
    type: "implementation",
    domain: "core",
    priority: "medium",
    depends_on: [],
    blocks: [],
    conflicts_with: [],
    can_run_independently: true,
    allowed_paths: [`src/${id}.ts`],
    forbidden_paths: [],
    path_ownership: {
      touched_paths: [],
      locked_paths: [],
      unsafe_parallel_areas: [],
    },
    goal: "Coordinate task work.",
    acceptance_criteria: ["The queue is deterministic."],
    verification: {
      commands: ["pnpm test -- coordinator"],
    },
    outputs_required: ["files_changed", "tests_run"],
    notes: [],
    ...overrides,
  };

  mkdirSync(p.tasksActive, { recursive: true });
  writeFileSync(join(p.tasksActive, `${id}.yaml`), stringify(task, { lineWidth: 0 }), "utf-8");
}

function buildQueue() {
  const { tasks, errors } = loadTasks(p.specsTasks, "all");
  expect(errors).toEqual([]);
  return buildCoordinatorQueue(tasks);
}

describe("coordinator queue", () => {
  it("groups independent tasks into the runnable owner batch", () => {
    writeTask("alpha", { priority: "high" });
    writeTask("beta", { priority: "medium" });

    const queue = buildQueue();

    expect(queue.runnable.map((item) => item.id)).toEqual(["alpha", "beta"]);
    expect(queue.waiting).toEqual([]);
  });

  it("explains dependency and blocker waits", () => {
    writeTask("setup", {
      status: "pending",
      blocks: ["feature"],
    });
    writeTask("feature", {
      depends_on: ["setup"],
    });
    writeTask("reviewed-dep", {
      status: "needs_review",
    });
    writeTask("uses-reviewed-dep", {
      depends_on: ["reviewed-dep"],
    });

    const queue = buildQueue();

    expect(queue.runnable.map((item) => item.id)).toContain("setup");
    expect(queue.runnable.map((item) => item.id)).toContain("uses-reviewed-dep");
    expect(queue.waiting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "feature",
          reason: expect.stringContaining("waiting on dependencies: setup"),
        }),
      ])
    );
    expect(queue.waiting.find((item) => item.id === "feature")?.reason).toContain("blocked by: setup");
  });

  it("keeps explicit conflicts out of the parallel-safe runnable batch", () => {
    writeTask("api");
    writeTask("ui", {
      conflicts_with: ["api"],
    });

    const queue = buildQueue();

    expect(queue.runnable.map((item) => item.id)).toEqual(["api"]);
    expect(queue.waiting).toEqual([
      expect.objectContaining({
        id: "ui",
        reason: "explicit conflict with api",
      }),
    ]);
  });

  it("keeps path lock overlaps out of the parallel-safe runnable batch", () => {
    writeTask("owner", {
      status: "in_progress",
      allowed_paths: ["src/commands/**"],
      path_ownership: {
        touched_paths: [],
        locked_paths: ["src/commands/compile.ts"],
        unsafe_parallel_areas: [],
      },
    });
    writeTask("compiler", {
      allowed_paths: ["src/commands/compile.ts"],
    });

    const queue = buildQueue();

    expect(queue.runnable.map((item) => item.id)).toEqual(["owner"]);
    expect(queue.waiting).toEqual([
      expect.objectContaining({
        id: "compiler",
        reason: expect.stringContaining("path overlap with owner"),
      }),
    ]);
  });

  it("groups review, complete-ready, blocked, and rework-needed tasks", () => {
    writeTask("active-work", {
      status: "in_progress",
      allowed_paths: ["src/reviewed.ts"],
    });
    writeTask("needs-human-review", {
      status: "needs_review",
      allowed_paths: ["src/review-only.ts"],
    });
    writeTask("review-needs-rework", {
      status: "needs_review",
      allowed_paths: ["src/reviewed.ts"],
    });
    writeTask("done-but-active", {
      status: "complete",
    });
    writeTask("blocked-task", {
      status: "blocked",
    });
    writeTask("partial-task", {
      status: "partial",
    });

    const queue = buildQueue();

    expect(queue.needsReview.map((item) => item.id)).toEqual(["needs-human-review"]);
    expect(queue.completeReady.map((item) => item.id)).toEqual(["done-but-active"]);
    expect(queue.blocked.map((item) => item.id)).toEqual(["blocked-task"]);
    expect(queue.reworkNeeded.map((item) => item.id)).toEqual(["partial-task", "review-needs-rework"]);
    expect(queue.reworkNeeded.find((item) => item.id === "review-needs-rework")?.reason).toContain(
      "path overlap with active-work"
    );
  });

  it("prints grouped command output with concise reasons", () => {
    writeTask("runner");
    writeTask("waiter", {
      depends_on: ["runner"],
    });
    writeTask("review", {
      status: "needs_review",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      coordinatorCommand(p.specsTasks, cwd);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Assignr Coordinator Queue");
      expect(output).toContain("runnable");
      expect(output).toContain("waiting");
      expect(output).toContain("needs_review");
      expect(output).toContain("complete-ready");
      expect(output).toContain("blocked");
      expect(output).toContain("rework-needed");
      expect(output).toContain("waiting on dependencies: runner");
    } finally {
      logSpy.mockRestore();
    }
  });
});
