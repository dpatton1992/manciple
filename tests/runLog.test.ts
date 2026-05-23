import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

import { initCommand } from "../src/commands/init.js";
import { newCommand } from "../src/commands/new.js";
import { runLogCommand } from "../src/commands/runLog.js";
import { getPaths } from "../src/utils/paths.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

function latestRunLog(): string {
  const files = readdirSync(p.runs).filter((file) => file.endsWith(".md")).sort();
  return readFileSync(join(p.runs, files.at(-1) ?? ""), "utf-8");
}

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "assignr-run-log-"));
  p = getPaths(cwd, ".assignr");
  await initCommand({ force: false, cwd, root: ".assignr" });
  newCommand("Run log capture", {
    type: "implementation",
    domain: "core",
    priority: "high",
    cwd,
    activeDir: p.tasksActive,
  });
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("runLogCommand", () => {
  it("auto-populates changed files from git status", () => {
    spawnSync("git", ["init"], { cwd, encoding: "utf-8" });
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "app.ts"), "export const ok = true;\n", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      runLogCommand("run-log-capture", p.specsTasks, p.runs, p.promptsGenerated, cwd);

      expect(existsSync(p.runs)).toBe(true);
      const content = latestRunLog();
      expect(content).toContain("_Source: auto-detected from git status_");
      expect(content).toContain("- src/app.ts");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("records flag-provided metadata and repeated commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      runLogCommand("run-log-capture", p.specsTasks, p.runs, p.promptsGenerated, cwd, {
        result: "partial",
        model: "gpt-5-codex",
        agent: "Codex",
        commandsRun: ["pnpm typecheck", "pnpm test"],
        filesChanged: ["src/commands/runLog.ts"],
        risks: "No known runtime risks.",
        notes: "Implemented run-log metadata capture.",
      });

      const content = latestRunLog();
      expect(content).toContain("- Agent/Harness (provided by user): Codex");
      expect(content).toContain("- Model (provided by user): gpt-5-codex");
      expect(content).toContain("- src/commands/runLog.ts");
      expect(content).toContain("- pnpm typecheck");
      expect(content).toContain("- pnpm test");
      expect(content).toContain("partial");
      expect(content).toContain("No known runtime risks.");
      expect(content).toContain("Implemented run-log metadata capture.");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("succeeds with clear fallback text outside a git repository", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      runLogCommand("run-log-capture", p.specsTasks, p.runs, p.promptsGenerated, cwd);

      const content = latestRunLog();
      expect(content).toContain("_Source: unknown_");
      expect(content).toContain("Unknown: git is unavailable or this directory is not a git repository.");
      expect(content).toContain("Unknown: no commands were provided.");
    } finally {
      logSpy.mockRestore();
    }
  });
});
