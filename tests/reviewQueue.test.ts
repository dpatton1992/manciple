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

function runDeep(options: { all?: boolean; budget?: string | number; deepOnly?: "risky" } = {}): void {
  reviewQueueCommand(p.tasksActive, cwd, {
    mode: "deep",
    all: options.all,
    budget: options.budget,
    deepOnly: options.deepOnly,
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

  it("deep mode emits review prompt targets for tasks missing evidence", () => {
    writeTask("missing-evidence");
    writeGeneratedPrompts("missing-evidence");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      expect(exitSpy).not.toHaveBeenCalled();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep\tmissing-evidence\tprompt=.assignr/prompts/generated/review-missing-evidence.md");
      expect(output).toContain("reasons=missing-evidence: No run log is available for task missing-evidence.");
      expect(output).toContain("evidence=score=");
      expect(output).toContain("missing=No run log is available for task missing-evidence.");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode escalates residual risk with the evidence that triggered it", () => {
    writeTask("risky-review");
    writeCompleteRunLog("risky-review", {
      risks: "Manual migration may need production coordination.",
    });
    writeGeneratedPrompts("risky-review");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep\trisky-review");
      expect(output).toContain("Documented risk(s) need review: Manual migration may need production coordination.");
      expect(output).toContain("risks=Manual migration may need production coordination.");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode escalates failed verification evidence", () => {
    writeTask("deep-failed-tests");
    writeCompleteRunLog("deep-failed-tests", {
      result: "failed",
      commandsRun: ["pnpm build"],
      testsRun: ["pnpm build"],
    });
    writeGeneratedPrompts("deep-failed-tests");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep\tdeep-failed-tests");
      expect(output).toContain("Verification command(s) appear to have failed: pnpm build.");
      expect(output).toContain("failedVerification=pnpm build");
      expect(output).toContain("missingVerification=pnpm test");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode escalates forbidden path changes", () => {
    writeTask("deep-path-violation", {
      allowed_paths: ["src/review/"],
      forbidden_paths: ["dist/"],
    });
    writeCompleteRunLog("deep-path-violation", {
      filesChanged: ["dist/index.js"],
    });
    writeGeneratedPrompts("deep-path-violation");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep\tdeep-path-violation");
      expect(output).toContain("Changed file dist/index.js matches forbidden_paths entry dist/.");
      expect(output).toContain("changedFiles=run-log");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode does not escalate passing tasks unless all review tasks are requested", () => {
    writeTask("ready-deep-review");
    writeCompleteRunLog("ready-deep-review");
    writeGeneratedPrompts("ready-deep-review");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      expect(logSpy.mock.calls.flat().join("\n")).toBe("No tasks escalated for deep review.");

      logSpy.mockClear();
      expect(() => runDeep({ all: true })).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep-all\tready-deep-review");
      expect(output).toContain("reasons=deterministic=pass");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode includes compact packets for escalated tasks", () => {
    writeTask("packet-review", {
      acceptance_criteria: [
        "Review queue triage classifies task evidence.",
        "Review queue packet stays compact.",
      ],
    });
    writeCompleteRunLog("packet-review", {
      risks: "Reviewer should confirm rollout order.",
      acceptanceCriteriaEvidence: ["Review queue triage classifies task evidence.: Complete receipt covers triage."],
    });
    writeGeneratedPrompts("packet-review");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep()).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("deep\tpacket-review");
      expect(output).toContain("packet=id=packet-review;status=needs_review;changedFiles=2;");
      expect(output).toContain("path=allowed:0 forbidden:0");
      expect(output).toContain("tests=yes");
      expect(output).toContain("criteria=2");
      expect(output).toContain("evidence=1/2");
      expect(output).toContain("risks=documented-risk,incomplete-acceptance-evidence");
      expect(output).toContain("question=Which acceptance criterion still needs evidence?");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep-only risky skips passing tasks even when all review tasks are requested", () => {
    writeTask("ready-deep-review", {
      allowed_paths: ["src/ready.ts"],
    });
    writeCompleteRunLog("ready-deep-review", {
      filesChanged: ["src/ready.ts"],
    });
    writeGeneratedPrompts("ready-deep-review");
    writeTask("missing-risky", {
      allowed_paths: ["src/missing-risky.ts"],
    });
    writeGeneratedPrompts("missing-risky");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep({ all: true, deepOnly: "risky" })).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).not.toContain("ready-deep-review");
      expect(output).toContain("deep\tmissing-risky");
      expect(output).toContain("risks=incomplete-acceptance-evidence,missing-evidence,missing-receipt");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("deep mode enforces a packet budget and reports how many fit", () => {
    writeTask("budgeted-review");
    writeGeneratedPrompts("budgeted-review");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() => runDeep({ budget: 1 })).not.toThrow();
      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).not.toContain("deep\tbudgeted-review");
      expect(output).toContain("budget\tlimit=1\tfit=0/1\testimated=0");
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
