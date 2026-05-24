import { mkdirSync, rmSync, writeFileSync } from "fs";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { afterEach, describe, expect, it } from "vitest";
import { listTasksForMcp } from "../src/mcpList.js";
import { getPaths } from "../src/utils/paths.js";
import type { TaskTier } from "../src/specs/loadTasks.js";

const tempDirs: string[] = [];

function writeTask(root: string, tier: TaskTier, id: string, status = "pending"): void {
  const paths = getPaths(root, ".assignr");
  const dirByTier = {
    active: paths.tasksActive,
    completed: paths.tasksCompleted,
    archived: paths.tasksArchived,
  };
  const dir = dirByTier[tier];
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.yaml`),
    [
      `id: ${id}`,
      `title: ${id}`,
      `status: ${status}`,
      "type: implementation",
      "domain: core",
      "priority: medium",
      "depends_on: []",
      "goal: Test task.",
      "acceptance_criteria:",
      "  - It works.",
      "allowed_paths:",
      "  - src/**",
      "forbidden_paths: []",
      "verification:",
      "  commands:",
      "    - pnpm test",
      "outputs_required:",
      "  - files_changed",
      "notes: []",
      "",
    ].join("\n"),
    "utf-8"
  );
}

describe("listTasksForMcp", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats status=active as a lifecycle tier filter", async () => {
    const root = await mkdtemp(join(tmpdir(), "assignr-mcp-list-"));
    tempDirs.push(root);
    const paths = getPaths(root, ".assignr");
    writeTask(root, "active", "active-task");
    writeTask(root, "completed", "completed-task", "complete");

    const tasks = listTasksForMcp(paths.specsTasks, root, { status: "active" });

    expect(tasks).toEqual([
      expect.objectContaining({
        id: "active-task",
        status: "pending",
        tier: "active",
      }),
    ]);
  });

  it("keeps task status filters for real statuses", async () => {
    const root = await mkdtemp(join(tmpdir(), "assignr-mcp-list-"));
    tempDirs.push(root);
    const paths = getPaths(root, ".assignr");
    writeTask(root, "active", "pending-task");
    writeTask(root, "active", "review-task", "needs_review");

    const tasks = listTasksForMcp(paths.specsTasks, root, { status: "needs_review" });

    expect(tasks.map((task) => task.id)).toEqual(["review-task"]);
  });

  it("lists active lifecycle tasks independently of task status", async () => {
    const root = await mkdtemp(join(tmpdir(), "assignr-mcp-list-"));
    tempDirs.push(root);
    const paths = getPaths(root, ".assignr");
    writeTask(root, "active", "pending-task");
    writeTask(root, "active", "review-task", "needs_review");
    writeTask(root, "active", "blocked-task", "blocked");
    writeTask(root, "completed", "completed-task", "complete");

    const tasks = listTasksForMcp(paths.specsTasks, root, { tier: "active" });

    expect(tasks.map((task) => [task.id, task.status, task.tier]).sort()).toEqual([
      ["blocked-task", "blocked", "active"],
      ["pending-task", "pending", "active"],
      ["review-task", "needs_review", "active"],
    ]);
  });

  it("finds completed tasks when filtering by complete status", async () => {
    const root = await mkdtemp(join(tmpdir(), "assignr-mcp-list-"));
    tempDirs.push(root);
    const paths = getPaths(root, ".assignr");
    writeTask(root, "active", "pending-task");
    writeTask(root, "completed", "completed-task", "complete");

    const tasks = listTasksForMcp(paths.specsTasks, root, { status: "complete" });

    expect(tasks.map((task) => [task.id, task.tier])).toEqual([
      ["completed-task", "completed"],
    ]);
  });

  it("can list every lifecycle tier with status=all", async () => {
    const root = await mkdtemp(join(tmpdir(), "assignr-mcp-list-"));
    tempDirs.push(root);
    const paths = getPaths(root, ".assignr");
    writeTask(root, "active", "active-task");
    writeTask(root, "archived", "archived-task", "blocked");

    const tasks = listTasksForMcp(paths.specsTasks, root, { status: "all" });

    expect(tasks.map((task) => [task.id, task.tier])).toEqual([
      ["active-task", "active"],
      ["archived-task", "archived"],
    ]);
  });
});
