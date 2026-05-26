import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { stringify } from "yaml";

import { initCommand } from "../src/commands/init.js";
import {
  buildTokenEstimate,
  DEFAULT_TOKEN_BUDGET,
  estimateTokens,
  renderTokenEstimate,
  tokenEstimateCommand,
} from "../src/commands/tokenEstimate.js";
import { runLogCommand } from "../src/commands/runLog.js";
import { getPaths } from "../src/utils/paths.js";
import type { TaskSpec } from "../src/specs/schema.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "assignr-token-estimate-"));
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
    allowed_paths: ["src/commands/tokenEstimate.ts", "tests/tokenEstimate.test.ts"],
    forbidden_paths: ["dist/"],
    goal: "Estimate prompt size before worker handoff.",
    acceptance_criteria: ["The token estimate command reports source buckets."],
    verification: {
      commands: ["pnpm typecheck", "pnpm test -- tokenEstimate"],
    },
    outputs_required: ["files_changed", "tests_run", "risks"],
    notes: ["Use local deterministic estimates only."],
    ...overrides,
  };

  mkdirSync(p.tasksActive, { recursive: true });
  writeFileSync(join(p.tasksActive, `${id}.yaml`), stringify(task, { lineWidth: 0 }), "utf-8");
}

describe("tokenEstimateCommand", () => {
  it("uses the documented deterministic heuristic", () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(4)).toBe(1);
    expect(estimateTokens(5)).toBe(2);
  });

  it("renders normal output with compiled total and source buckets", () => {
    writeTask("estimate-normal");

    const result = buildTokenEstimate({
      specsTasksDir: p.specsTasks,
      cwd,
      taskId: "estimate-normal",
    });
    const output = renderTokenEstimate(result);

    expect(result.budget).toBe(DEFAULT_TOKEN_BUDGET);
    expect(output).toContain("# Token Estimate: estimate-normal");
    expect(output).toContain("Deterministic local heuristic: estimated tokens = ceil(characters / 4). No external APIs are called.");
    expect(output).toContain("Scope: estimates Assignr handoff prompt bloat, not total agent spend.");
    expect(output).toContain("- compiled prompt total:");
    expect(output).toContain("- task spec:");
    expect(output).toContain("- domain context:");
    expect(output).toContain("- template/instructions:");
    expect(output).toContain("- verification/review contract:");
    expect(output).toContain("Risk: within budget");
  });

  it("reports missing task handling with a non-zero exit", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => tokenEstimateCommand({
        specsTasksDir: p.specsTasks,
        cwd,
        taskId: "missing-task",
      })).toThrow("process.exit(1)");
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("No task found with id: missing-task");
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("includes optional review, run-log, diff, and git context sources when requested", () => {
    writeTask("estimate-optional");
    runLogCommand("estimate-optional", p.specsTasks, p.runs, p.promptsGenerated, cwd, {
      result: "complete",
      commandsRun: ["pnpm typecheck"],
      testsRun: ["pnpm test -- tokenEstimate"],
      filesChanged: ["src/commands/tokenEstimate.ts"],
      risks: "none",
      acceptanceCriteriaEvidence: ["The token estimate command reports source buckets.: Output labels were asserted."],
    });
    spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd, encoding: "utf-8" });
    spawnSync("git", ["config", "user.name", "Test User"], { cwd, encoding: "utf-8" });
    writeFileSync(join(cwd, "tracked.txt"), "before\n", "utf-8");
    spawnSync("git", ["add", "tracked.txt"], { cwd, encoding: "utf-8" });
    spawnSync("git", ["commit", "-m", "initial"], { cwd, encoding: "utf-8" });
    writeFileSync(join(cwd, "tracked.txt"), "after\n", "utf-8");
    writeFileSync(join(cwd, "untracked.txt"), "context\n", "utf-8");

    const output = renderTokenEstimate(buildTokenEstimate({
      specsTasksDir: p.specsTasks,
      cwd,
      taskId: "estimate-optional",
      includeReview: true,
      includeRunLog: true,
      includeDiff: true,
      includeGitContext: true,
    }));

    expect(output).toContain("- optional review prompt:");
    expect(output).toContain("- optional latest run log:");
    expect(output).toContain("- optional git diff:");
    expect(output).toContain("- optional git context:");
  });

  it("reports over-budget risk against a configurable budget", () => {
    writeTask("estimate-over-budget", {
      goal: "x".repeat(100),
    });

    const output = renderTokenEstimate(buildTokenEstimate({
      specsTasksDir: p.specsTasks,
      cwd,
      taskId: "estimate-over-budget",
      budget: 1,
    }));

    expect(output).toContain("Budget: 1 estimated tokens");
    expect(output).toContain("Risk: over budget");
  });
});
