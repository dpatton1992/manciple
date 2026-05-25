import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { stringify } from "yaml";

import { initCommand } from "../src/commands/init.js";
import { reviewQueueCommand } from "../src/commands/reviewQueue.js";
import { runLogCommand } from "../src/commands/runLog.js";
import { getPaths } from "../src/utils/paths.js";
import type { TaskSpec } from "../src/specs/schema.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "assignr-review-queue-"));
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
    allowed_paths: ["src/commands/reviewQueue.ts", "tests/reviewQueue.test.ts"],
    forbidden_paths: ["dist/"],
    goal: "Triage review queue evidence.",
    acceptance_criteria: ["Review queue triage classifies task evidence."],
    verification: {
      commands: ["pnpm build", "pnpm test"],
    },
    outputs_required: ["files_changed", "tests_run", "decisions_made", "risks"],
    notes: [],
    ...overrides,
  };

  mkdirSync(p.tasksActive, { recursive: true });
  writeFileSync(join(p.tasksActive, `${id}.yaml`), stringify(task, { lineWidth: 0 }), "utf-8");
}

function writeCompleteRunLog(taskId: string, overrides: Parameters<typeof runLogCommand>[5] = {}): void {
  runLogCommand(taskId, p.specsTasks, p.runs, p.promptsGenerated, cwd, {
    result: "complete",
    commandsRun: ["pnpm build", "pnpm test"],
    testsRun: ["pnpm build", "pnpm test"],
    filesChanged: ["src/commands/reviewQueue.ts", "tests/reviewQueue.test.ts"],
    decisionsMade: ["Review queue triage classifies task evidence."],
    risks: "none",
    followUps: ["none"],
    acceptanceCriteriaEvidence: ["Review queue triage classifies task evidence.: Complete receipt covers triage."],
    ...overrides,
  });
}

function writeGeneratedPrompts(taskId: string): void {
  mkdirSync(p.promptsGenerated, { recursive: true });
  writeFileSync(join(p.promptsGenerated, `${taskId}.md`), "implementation prompt", "utf-8");
  writeFileSync(join(p.promptsGenerated, `review-${taskId}.md`), "review prompt", "utf-8");
}

function runTriage(): void {
  reviewQueueCommand(p.tasksActive, cwd, {
    mode: "triage",
    generatedDir: p.promptsGenerated,
    activeDir: p.tasksActive,
    completedDir: p.tasksCompleted,
    archivedDir: p.tasksArchived,
  });
}

describe("reviewQueueCommand", () => {
  it("prints pass rows for needs_review tasks with complete deterministic evidence", () => {
    writeTask("ready-review");
    writeCompleteRunLog("ready-review");
    writeGeneratedPrompts("ready-review");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runTriage()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.flat().join("\n")).toContain("pass\tready-review\tdeterministic=pass");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("escalates tasks with missing run log evidence", () => {
    writeTask("missing-log");
    writeGeneratedPrompts("missing-log");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runTriage()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("escalate\tmissing-log");
      expect(output).toContain("missing-run-log: No run log is available for task missing-log.");
      expect(output).toContain("missing-evidence: No verification commands are recorded in the run log.");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("escalates tasks with failed or missing verification evidence", () => {
    writeTask("failed-tests");
    writeCompleteRunLog("failed-tests", {
      result: "failed",
      commandsRun: ["pnpm build"],
      testsRun: ["pnpm build"],
    });
    writeGeneratedPrompts("failed-tests");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runTriage()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("escalate\tfailed-tests");
      expect(output).toContain("Run log is missing expected verification command(s): pnpm test.");
      expect(output).toContain("Verification command(s) appear to have failed: pnpm build.");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("escalates tasks with obvious allowed and forbidden path violations", () => {
    writeTask("path-violation", {
      allowed_paths: ["src/review/"],
      forbidden_paths: ["dist/"],
    });
    writeCompleteRunLog("path-violation", {
      filesChanged: ["dist/index.js", "README.md"],
    });
    writeGeneratedPrompts("path-violation");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runTriage()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("escalate\tpath-violation");
      expect(output).toContain("Changed file README.md is outside allowed_paths.");
      expect(output).toContain("Changed file dist/index.js matches forbidden_paths entry dist/.");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("blocks load errors that prevent deterministic triage", () => {
    mkdirSync(p.tasksActive, { recursive: true });
    writeFileSync(join(p.tasksActive, "invalid.yaml"), "id: invalid\nstatus: nope\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => reviewQueueCommand(p.tasksActive, cwd, {
        mode: "triage",
        generatedDir: p.promptsGenerated,
        activeDir: p.tasksActive,
        completedDir: p.tasksCompleted,
        archivedDir: p.tasksArchived,
      })).toThrow("process.exit(1)");
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("blocked\tinvalid<unknown>\tload-error:");
      expect(output).toContain("Task YAML failed to load");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
