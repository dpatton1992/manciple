import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

describe("assignr-token-audit script", () => {
  it("delegates to the deterministic token-estimate command and prints bucket output", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/assignr-token-audit.mjs", "add-assignr-token-estimate-command", "--budget", "999999"],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("# Token Estimate: add-assignr-token-estimate-command");
    expect(result.stdout).toContain("Deterministic local heuristic: estimated tokens = ceil(characters / 4). No external APIs are called.");
    expect(result.stdout).toContain("Scope: estimates Assignr handoff prompt bloat, not total agent spend.");
    expect(result.stdout).toContain("## Source Buckets");
    expect(result.stdout).toContain("Risk: within budget");
  });

  it("keeps packaged skill directories included", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as {
      files?: string[];
    };

    expect(packageJson.files).toContain(".claude/skills/");
    expect(packageJson.files).toContain(".codex/skills/");
    expect(packageJson.files).toContain("scripts/assignr-token-audit.mjs");
  });
});
