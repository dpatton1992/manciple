import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";

import { initCommand } from "../src/commands/init.js";
import { reviewCheckCommand } from "../src/commands/reviewCheck.js";
import { runLogCommand } from "../src/commands/runLog.js";
import { getPaths } from "../src/utils/paths.js";
import type { TaskSpec } from "../src/specs/schema.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "assignr-review-check-"));
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
    status: "needs_review",
    type: "implementation",
    domain: "core",
    priority: "medium",
    depends_on: [],
    allowed_paths: ["src/commands/reviewCheck.ts"],
    forbidden_paths: ["dist/"],
    goal: "Check review evidence.",
    acceptance_criteria: ["Review evidence is checked."],
    verification: {
      commands: ["pnpm build", "pnpm test"],
    },
    outputs_required: ["files_changed", "risks"],
    notes: [],
    ...overrides,
  };

  mkdirSync(p.tasksActive, { recursive: true });
  writeFileSync(join(p.tasksActive, `${id}.yaml`), stringify(task, { lineWidth: 0 }), "utf-8");
}

function writeCompleteRunLog(taskId: string): void {
  runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd, {
    result: "complete",
    commandsRun: ["pnpm build", "pnpm test"],
    filesChanged: ["src/commands/reviewCheck.ts", "tests/reviewCheck.test.ts"],
    risks: "none",
  });
}

describe("reviewCheckCommand", () => {
  it("exits zero and prints ready rows when all needs_review tasks are ready", () => {
    writeTask("ready-one");
    writeTask("ready-two");
    writeCompleteRunLog("ready-one");
    writeCompleteRunLog("ready-two");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => reviewCheckCommand(p.tasksActive, cwd)).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("ready\tready-one\t-");
      expect(output).toContain("ready\tready-two\t-");
      expect(output).not.toContain("missing");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("exits non-zero and prints shared missing-evidence messages", () => {
    writeTask("missing-evidence");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => reviewCheckCommand(p.tasksActive, cwd)).toThrow("process.exit(1)");
      expect(exitSpy).toHaveBeenCalledWith(1);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("missing\tmissing-evidence\t");
      expect(output).toContain("No run log is available for task missing-evidence.");
      expect(output).toContain("No verification commands are recorded in the run log.");
      expect(output).toContain("No risks entry is recorded in the run log");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("narrows checks to a single task id", () => {
    writeTask("selected-ready");
    writeTask("unselected-missing");
    writeCompleteRunLog("selected-ready");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => reviewCheckCommand(p.tasksActive, cwd, "selected-ready")).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("ready\tselected-ready\t-");
      expect(output).not.toContain("unselected-missing");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
