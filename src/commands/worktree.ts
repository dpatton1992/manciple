import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { dirname, join } from "path";

type GitRunner = (args: string[], options?: { cwd?: string }) => string;

export interface WorktreeCommandOptions {
  cwd: string;
  worktreesDir: string;
  force?: boolean;
  runner?: GitRunner;
}

function runGit(args: string[], options?: { cwd?: string }): string {
  return execFileSync("git", args, {
    cwd: options?.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function relativeToCwd(cwd: string, path: string): string {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

function deterministicBranchName(taskId: string): string {
  return `assignr/${taskId}`;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isEmptyDirectory(path: string): boolean {
  return isDirectory(path) && readdirSync(path).length === 0;
}

function existingWorktreeBranch(path: string, runner: GitRunner): string | undefined {
  try {
    runner(["-C", path, "rev-parse", "--is-inside-work-tree"]);
    return runner(["-C", path, "branch", "--show-current"]);
  } catch {
    return undefined;
  }
}

export function worktreeCommand(taskId: string, options: WorktreeCommandOptions): void {
  const { cwd, worktreesDir, force = false, runner = runGit } = options;
  const branch = deterministicBranchName(taskId);
  const worktreePath = join(worktreesDir, taskId);
  const relativePath = relativeToCwd(cwd, worktreePath);

  try {
    runner(["rev-parse", "--show-toplevel"], { cwd });
  } catch {
    console.error("Not a git repository. Run assignr worktree from inside a git repository.");
    process.exit(1);
  }

  if (existsSync(worktreePath)) {
    const existingBranch = existingWorktreeBranch(worktreePath, runner);
    if (existingBranch === branch) {
      console.log(`Worktree already exists: ${relativePath}`);
      console.log(`Branch: ${branch}`);
      return;
    }

    if (!isEmptyDirectory(worktreePath)) {
      if (!force) {
        console.error(`Refusing to overwrite non-empty worktree path: ${relativePath}`);
        console.error("Use --force to remove it and create a fresh task worktree.");
        process.exit(1);
      }
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  mkdirSync(dirname(worktreePath), { recursive: true });
  runner(["worktree", "add", "-b", branch, worktreePath, "HEAD"], { cwd });

  console.log(`Worktree created: ${relativePath}`);
  console.log(`Branch: ${branch}`);
}
