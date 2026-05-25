import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { listCommand } from "../src/commands/list.js";
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
      `title: ${id} title`,
      `status: ${status}`,
      "type: implementation",
      "domain: core",
      "priority: medium",
      "depends_on: []",
      "allowed_paths:",
      "  - src/**",
      "forbidden_paths: []",
      `goal: Complete ${id}.`,
      "acceptance_criteria:",
      "  - It works.",
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

function makeRepo(): { root: string; paths: ReturnType<typeof getPaths> } {
  const root = mkdtempSync(join(tmpdir(), "assignr-list-"));
  tempDirs.push(root);
  return { root, paths: getPaths(root, ".assignr") };
}

describe("listCommand", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("shows active tasks by default without completed or archived tasks", () => {
    const { root, paths } = makeRepo();
    writeTask(root, "active", "active-task");
    writeTask(root, "completed", "completed-task", "complete");
    writeTask(root, "archived", "archived-task", "blocked");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    listCommand(paths.specsTasks, root);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("active-task");
    expect(output).not.toContain("completed-task");
    expect(output).not.toContain("archived-task");
  });

  it("requires explicit flags to show completed or archived lifecycle tiers", () => {
    const { root, paths } = makeRepo();
    writeTask(root, "active", "active-task");
    writeTask(root, "completed", "completed-task", "complete");
    writeTask(root, "archived", "archived-task", "blocked");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    listCommand(paths.specsTasks, root, { completed: true });
    listCommand(paths.specsTasks, root, { archived: true });

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("completed-task");
    expect(output).toContain("archived-task");
  });
});
