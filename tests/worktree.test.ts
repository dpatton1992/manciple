import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { worktreeCommand } from "../src/commands/worktree.js";
import { getPaths } from "../src/utils/paths.js";

let cwd: string;
let p: ReturnType<typeof getPaths>;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "manciple-worktree-"));
  p = getPaths(cwd, ".manciple");
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  }) as never);
}

describe("manciple worktree", () => {
  it("constructs a task-specific branch and default worktree path", () => {
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const runner = vi.fn((args: string[], options?: { cwd?: string }) => {
      calls.push({ args, cwd: options?.cwd });
      if (args.join(" ") === "rev-parse --show-toplevel") {
        return cwd;
      }
      return "";
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      worktreeCommand("extract-auth-middleware", {
        cwd,
        worktreesDir: p.worktrees,
        runner,
      });

      expect(calls).toEqual([
        { args: ["rev-parse", "--show-toplevel"], cwd },
        {
          args: [
            "worktree",
            "add",
            "-b",
            "manciple/extract-auth-middleware",
            join(p.worktrees, "extract-auth-middleware"),
            "HEAD",
          ],
          cwd,
        },
      ]);

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Worktree created: .manciple/worktrees/extract-auth-middleware");
      expect(output).toContain("Branch: manciple/extract-auth-middleware");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("reports an existing matching worktree without creating a new one", () => {
    const worktreePath = join(p.worktrees, "extract-auth-middleware");
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(join(worktreePath, "README.md"), "existing worktree\n", "utf-8");

    const runner = vi.fn((args: string[], options?: { cwd?: string }) => {
      if (args.join(" ") === "rev-parse --show-toplevel" && options?.cwd === cwd) {
        return cwd;
      }
      if (args[0] === "-C" && args[1] === worktreePath && args[2] === "rev-parse") {
        return "true";
      }
      if (args[0] === "-C" && args[1] === worktreePath && args[2] === "branch") {
        return "manciple/extract-auth-middleware";
      }
      return "";
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      worktreeCommand("extract-auth-middleware", {
        cwd,
        worktreesDir: p.worktrees,
        runner,
      });

      expect(runner).not.toHaveBeenCalledWith(
        ["worktree", "add", "-b", expect.any(String), expect.any(String), "HEAD"],
        expect.any(Object),
      );

      const output = logSpy.mock.calls.flat().join("\n");
      expect(output).toContain("Worktree already exists: .manciple/worktrees/extract-auth-middleware");
      expect(output).toContain("Branch: manciple/extract-auth-middleware");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("refuses a non-empty unrelated worktree path unless forced", () => {
    const worktreePath = join(p.worktrees, "extract-auth-middleware");
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(join(worktreePath, "notes.txt"), "not a git worktree\n", "utf-8");

    const runner = vi.fn((args: string[], options?: { cwd?: string }) => {
      if (args.join(" ") === "rev-parse --show-toplevel" && options?.cwd === cwd) {
        return cwd;
      }
      if (args[0] === "-C") {
        throw new Error("not a worktree");
      }
      return "";
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = mockExit();

    try {
      expect(() => worktreeCommand("extract-auth-middleware", {
        cwd,
        worktreesDir: p.worktrees,
        runner,
      })).toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain(
        "Refusing to overwrite non-empty worktree path: .manciple/worktrees/extract-auth-middleware",
      );
      expect(existsSync(join(worktreePath, "notes.txt"))).toBe(true);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it("removes a non-empty unrelated path when forced", () => {
    const worktreePath = join(p.worktrees, "extract-auth-middleware");
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(join(worktreePath, "notes.txt"), "not a git worktree\n", "utf-8");

    const runner = vi.fn((args: string[], options?: { cwd?: string }) => {
      if (args.join(" ") === "rev-parse --show-toplevel" && options?.cwd === cwd) {
        return cwd;
      }
      if (args[0] === "-C") {
        throw new Error("not a worktree");
      }
      return "";
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      worktreeCommand("extract-auth-middleware", {
        cwd,
        worktreesDir: p.worktrees,
        force: true,
        runner,
      });

      expect(existsSync(join(worktreePath, "notes.txt"))).toBe(false);
      expect(runner).toHaveBeenCalledWith(
        ["worktree", "add", "-b",             "manciple/extract-auth-middleware", worktreePath, "HEAD"],
        { cwd },
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("fails clearly outside a git repository", () => {
    const runner = vi.fn(() => {
      throw new Error("fatal: not a git repository");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = mockExit();

    try {
      expect(() => worktreeCommand("extract-auth-middleware", {
        cwd,
        worktreesDir: p.worktrees,
        runner,
      })).toThrow("process.exit(1)");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain(
        "Not a git repository. Run manciple worktree from inside a git repository.",
      );
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
