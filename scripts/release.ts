#!/usr/bin/env node
/**
 * `pnpm release <patch|minor|major>`
 *
 * Bumps the version in package.json, publishes to npm, creates an annotated git tag,
 * pushes it, and creates a GitHub release with generated release notes.
 *
 * Options:
 *   --otp <code>    npm one-time password for 2FA
 *   --dry-run       Print steps without executing
 *   --preview       Show generated release notes only
 */
import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "fs";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PKG_PATH = resolve(REPO_ROOT, "package.json");

const VALID_BUMPS = ["patch", "minor", "major"] as const;
type BumpType = (typeof VALID_BUMPS)[number];
type CommandOptions = {
  stdio?: "inherit" | "pipe";
};

// ── Helpers ────────────────────────────────────────────────────────

function run(command: string, args: string[], options: CommandOptions = {}): void {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error || result.status !== 0) {
    if (result.error) {
      console.error(`Failed to start ${command}: ${result.error.message}`);
    }
    process.exit(result.status ?? 1);
  }
}

function runCapture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const printableCommand = [command, ...args].join(" ");
    throw new Error(result.stderr?.toString().trim() || result.error?.message || `Command failed: ${printableCommand}`);
  }
  return result.stdout.trim();
}

function getLastTag(): string | null {
  try {
    return runCapture("git", ["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
}

function bumpVersion(version: string, bump: BumpType): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }
  const [major, minor, patch] = parts;
  switch (bump) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

function generateReleaseNotes(newVersion: string): string {
  const lastTag = getLastTag();
  const log = lastTag
    ? runCapture("git", ["log", "--oneline", "--no-decorate", `${lastTag}..HEAD`])
    : runCapture("git", ["log", "--oneline", "--no-decorate"]);
  const date = new Date().toISOString().slice(0, 10);
  const lines = log.split("\n").filter(Boolean).map((l) => `- ${l}`).join("\n");
  return `## v${newVersion} (${date})\n\n${lines}\n`;
}

// ── Main ────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const bump = args.find((a) => VALID_BUMPS.includes(a as BumpType));
  const otpIdx = args.indexOf("--otp");
  const otp = otpIdx >= 0 ? args[otpIdx + 1] : undefined;
  const dryRun = args.includes("--dry-run");
  const preview = args.includes("--preview");

  if (!bump) {
    console.error(`Usage: pnpm release <${VALID_BUMPS.join("|")}> [--otp <code>] [--dry-run] [--preview]`);
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
  const currentVersion: string = pkg.version;
  const newVersion = bumpVersion(currentVersion, bump as BumpType);
  const notes = generateReleaseNotes(newVersion);

  if (preview) {
    console.log(notes);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Release v${newVersion}`);
    console.log(`  Bump: ${bump} (v${currentVersion} -> v${newVersion})`);
    console.log("  Steps:");
    console.log("    1. pnpm typecheck && pnpm test && pnpm build");
    console.log(`    2. Update package.json to v${newVersion}`);
    console.log("    3. pnpm build");
    console.log(`    4. npm publish${otp ? ` --otp ${otp}` : ""}`);
    console.log(`    5. git tag -a v${newVersion}`);
    console.log(`    6. git push origin v${newVersion}`);
    console.log(`    7. gh release create v${newVersion}`);
    console.log(`\n  Release notes:\n${notes}`);
    return;
  }

  // Step 1: Preflight
  console.log("Running preflight checks...");
  run("pnpm", ["typecheck"]);
  run("pnpm", ["test"]);
  run("pnpm", ["build"]);

  // Step 2: Bump version
  console.log(`\nUpdating package.json: v${currentVersion} -> v${newVersion}`);
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, "\t") + "\n");

  // Step 3: Rebuild
  console.log("Building with updated version...");
  run("pnpm", ["build"]);

  // Step 4: Publish
  const publishArgs = ["publish", ...(otp ? ["--otp", otp] : [])];
  console.log(`Publishing: npm ${publishArgs.join(" ")}`);
  run("npm", publishArgs);

  // Step 5: Git tag
  console.log(`Creating annotated git tag v${newVersion}...`);
  run("git", ["tag", "-a", `v${newVersion}`, "-m", `Release v${newVersion}`]);

  // Step 6: Push tag
  console.log(`Pushing tag v${newVersion} to origin...`);
  run("git", ["push", "origin", `v${newVersion}`]);

  // Step 7: GitHub release
  console.log("Creating GitHub release...");
  const tmpDir = mkdtempSync(join(tmpdir(), "manciple-release-"));
  const notesFile = join(tmpDir, "RELEASE_NOTES.md");
  writeFileSync(notesFile, notes, "utf-8");
  try {
    run("gh", ["release", "create", `v${newVersion}`, "--title", `v${newVersion}`, "--notes-file", notesFile]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n✓ Released v${newVersion}`);
  console.log(`  https://github.com/dpatton1992/manciple/releases/tag/v${newVersion}`);
}

main();
