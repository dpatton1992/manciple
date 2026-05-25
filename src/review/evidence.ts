import { existsSync, readdirSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import type { ReviewReadinessAcceptanceEvidence, ReviewReadinessRunLog } from "./readiness.js";

export function readLatestRunLogContent(cwd: string, taskId: string): string | undefined {
  const runLogDir = join(cwd, ".assignr", "runs", taskId);
  const runsDir = join(cwd, ".assignr", "runs");

  if (!existsSync(runLogDir)) {
    const flatLatestFile = existsSync(runsDir)
      ? readdirSync(runsDir)
          .filter((file) => file.endsWith(`-${taskId}.md`))
          .sort()
          .at(-1)
      : undefined;

    if (!flatLatestFile) {
      return undefined;
    }

    return readFileSync(join(runsDir, flatLatestFile), "utf-8").trim();
  }

  const latestFile = readdirSync(runLogDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .at(-1);

  if (!latestFile) {
    return undefined;
  }

  return readFileSync(join(runLogDir, latestFile), "utf-8").trim();
}

export function readGitChangedFiles(cwd: string): string[] {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((path) => {
      const renameMarker = " -> ";
      return path.includes(renameMarker) ? path.split(renameMarker).pop() ?? path : path;
    })
    .filter(Boolean);
}

export function extractRunLogSection(content: string, heading: string): string {
  const pattern = new RegExp(`^## ${heading}\\s*$`, "m");
  const match = pattern.exec(content);
  if (!match) return "";

  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const nextHeading = rest.search(/^## /m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

export function parseRunLogListSection(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseValueSection(section: string): string | undefined {
  const value = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("_Source:") && !line.startsWith("<!--"))
    .join("\n")
    .trim();

  if (!value || value.startsWith("Unknown:") || value === "TODO") {
    return undefined;
  }

  return value;
}

function parseAcceptanceEvidence(section: string): ReviewReadinessAcceptanceEvidence[] {
  return parseRunLogListSection(section).map((line) => {
    const separator = line.includes("=>") ? "=>" : ":";
    const [criterion, ...evidenceParts] = line.split(separator);
    return {
      criterion: criterion.trim(),
      evidence: evidenceParts.join(separator).trim() || undefined,
    };
  }).filter((entry) => entry.criterion);
}

export function parseRunLogEvidence(content: string | undefined): ReviewReadinessRunLog[] {
  if (!content) {
    return [];
  }

  return [{
    filesChanged: parseRunLogListSection(extractRunLogSection(content, "Files Changed")),
    testsRun: parseRunLogListSection(extractRunLogSection(content, "Tests Run")),
    commandsRun: parseRunLogListSection(extractRunLogSection(content, "Commands Run")),
    decisionsMade: parseRunLogListSection(extractRunLogSection(content, "Decisions Made")),
    result: parseValueSection(extractRunLogSection(content, "Result")),
    risks: parseValueSection(extractRunLogSection(content, "Risks")),
    followUps: parseRunLogListSection(extractRunLogSection(content, "Follow-Up Tasks")),
    acceptanceCriteriaEvidence: parseAcceptanceEvidence(extractRunLogSection(content, "Acceptance Criteria Evidence")),
    notes: parseValueSection(extractRunLogSection(content, "Notes")),
  }];
}
