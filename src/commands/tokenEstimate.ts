import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { loadTasks } from "../specs/loadTasks.js";
import { getTemplate, loadDomainContext } from "./compile.js";
import {
  renderTemplate,
  renderVerificationCommands,
  REVIEW_TEMPLATE,
} from "../templates/renderTemplate.js";
import {
  readGitDiff,
  readLatestRunLog,
  renderReviewPrompt,
} from "./review.js";

export const DEFAULT_TOKEN_BUDGET = 4000;
export const TOKEN_HEURISTIC_DESCRIPTION =
  "Deterministic local heuristic: estimated tokens = ceil(characters / 4). No external APIs are called.";

export interface TokenEstimateOptions {
  specsTasksDir: string;
  cwd: string;
  taskId: string;
  budget?: number;
  includeReview?: boolean;
  includeRunLog?: boolean;
  includeDiff?: boolean;
  includeGitContext?: boolean;
}

export interface TokenEstimateBucket {
  label: string;
  chars: number;
  estimatedTokens: number;
  optional?: boolean;
}

export interface TokenEstimateResult {
  taskId: string;
  budget: number;
  compiledPrompt: TokenEstimateBucket;
  buckets: TokenEstimateBucket[];
  optionalBuckets: TokenEstimateBucket[];
  totalWithOptional: TokenEstimateBucket;
  risk: "ok" | "over_budget";
}

export function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}

function estimateBucket(label: string, content: string, optional = false): TokenEstimateBucket {
  const chars = content.length;
  return {
    label,
    chars,
    estimatedTokens: estimateTokens(chars),
    optional,
  };
}

function outputRequiredText(values: string[] | undefined): string {
  if (!values || values.length === 0) return "_None specified._";
  return values.map((value) => `- ${value}`).join("\n");
}

function verificationReviewContract(spec: { verification?: { commands: string[] }; outputs_required?: string[] }): string {
  return [
    "## Verification Commands",
    renderVerificationCommands(spec.verification?.commands ?? []),
    "## Required Output",
    outputRequiredText(spec.outputs_required),
    "## Review Readiness",
    REVIEW_TEMPLATE.split("## Review Readiness")[1]?.trim() ?? "",
  ].join("\n\n");
}

function readGitContext(cwd: string): string {
  const result = spawnSync("git", ["status", "--short", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return "_No git context available._";
  }

  const status = result.stdout.trim();
  return status ? `Git status --short:\n${status}` : "_No changed files._";
}

export function buildTokenEstimate(options: TokenEstimateOptions): TokenEstimateResult {
  const budget = options.budget ?? DEFAULT_TOKEN_BUDGET;
  const { tasks, errors } = loadTasks(options.specsTasksDir, "all");

  if (errors.length > 0) {
    throw new Error(`Cannot estimate tokens: ${errors.length} task(s) failed to load.`);
  }

  const found = tasks.find((task) => task.spec.id === options.taskId);
  if (!found) {
    throw new Error(`No task found with id: ${options.taskId}`);
  }

  const spec = found.spec;
  const template = getTemplate(spec.type);
  const domainContext = loadDomainContext(options.specsTasksDir, spec.domain, options.cwd) ?? "";
  const compiledPrompt = renderTemplate(template, spec, domainContext || undefined);
  const taskSpecRaw = readFileSync(found.filePath, "utf-8");

  const buckets = [
    estimateBucket("task spec", taskSpecRaw),
    estimateBucket("domain context", domainContext),
    estimateBucket("template/instructions", template),
    estimateBucket("verification/review contract", verificationReviewContract(spec)),
  ];

  const optionalBuckets: TokenEstimateBucket[] = [];

  if (options.includeReview) {
    optionalBuckets.push(estimateBucket(
      "optional review prompt",
      renderReviewPrompt(spec, options.cwd, {
        includeRunLog: options.includeRunLog ?? false,
        includeGitDiff: options.includeDiff ?? false,
      }),
      true
    ));
  }

  if (options.includeRunLog) {
    optionalBuckets.push(estimateBucket("optional latest run log", readLatestRunLog(options.cwd, spec.id), true));
  }

  if (options.includeDiff) {
    optionalBuckets.push(estimateBucket("optional git diff", readGitDiff(options.cwd), true));
  }

  if (options.includeGitContext) {
    optionalBuckets.push(estimateBucket("optional git context", readGitContext(options.cwd), true));
  }

  const compiledBucket = estimateBucket("compiled prompt total", compiledPrompt);
  const optionalChars = optionalBuckets.reduce((sum, bucket) => sum + bucket.chars, 0);
  const totalChars = compiledBucket.chars + optionalChars;
  const totalWithOptional = {
    label: "total with requested optional sources",
    chars: totalChars,
    estimatedTokens: estimateTokens(totalChars),
  };

  return {
    taskId: spec.id,
    budget,
    compiledPrompt: compiledBucket,
    buckets,
    optionalBuckets,
    totalWithOptional,
    risk: totalWithOptional.estimatedTokens > budget ? "over_budget" : "ok",
  };
}

function renderBucket(bucket: TokenEstimateBucket): string {
  return `- ${bucket.label}: ${bucket.chars} chars, ~${bucket.estimatedTokens} tokens`;
}

export function renderTokenEstimate(result: TokenEstimateResult): string {
  const optional = result.optionalBuckets.length > 0
    ? result.optionalBuckets.map(renderBucket).join("\n")
    : "- optional sources: not requested";
  const risk = result.risk === "over_budget"
    ? `Risk: over budget (${result.totalWithOptional.estimatedTokens}/${result.budget} estimated tokens).`
    : `Risk: within budget (${result.totalWithOptional.estimatedTokens}/${result.budget} estimated tokens).`;

  return `# Token Estimate: ${result.taskId}

${TOKEN_HEURISTIC_DESCRIPTION}
Scope: estimates Assignr handoff prompt bloat, not total agent spend.
Budget: ${result.budget} estimated tokens

## Compiled Prompt

${renderBucket(result.compiledPrompt)}

## Source Buckets

${result.buckets.map(renderBucket).join("\n")}

## Optional Sources

${optional}

## Total

${renderBucket(result.totalWithOptional)}
${risk}`;
}

export function tokenEstimateCommand(options: TokenEstimateOptions): void {
  try {
    console.log(renderTokenEstimate(buildTokenEstimate(options)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
