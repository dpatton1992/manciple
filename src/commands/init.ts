import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { getPaths } from "../utils/paths.js";
import {
  IMPLEMENTATION_TEMPLATE,
  REVIEW_TEMPLATE,
  TEST_TEMPLATE,
} from "../templates/renderTemplate.js";

const CONFIG_YAML = `# Assignr configuration
root: .assignr
`;

const STATE_JSON = JSON.stringify({ version: 1, tasks: [] }, null, 2);

const CORE_DOMAIN_YAML = `id: core
name: Core
description: General project work that does not belong to a more specific domain.
conventions: []
constraints: []
context: []
`;

const COMMANDS_README = `# Assignr Commands

This directory holds command reference files and local workflow notes.

## Usage

Run \`assignr --help\` to see all available commands.

## Workflow

\`\`\`bash
assignr new "My task title" --type implementation --domain core --priority high
assignr validate
assignr compile my-task-title
# Run the generated prompt in your preferred coding agent
assignr run-log my-task-title
assignr set-status my-task-title needs_review
assignr review my-task-title
\`\`\`
`;

function updateGitignore(cwd: string, root: string): void {
  const gitignorePath = join(cwd, ".gitignore");
  const entriesToAdd = [
    `${root}/prompts/generated/`,
    `${root}/runs/`,
  ];
  const header = "# assignr";

  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, "utf-8");
  }

  const missing = entriesToAdd.filter((e) => !existing.includes(e));
  if (missing.length === 0) return;

  const block = `\n${header}\n${missing.join("\n")}\n`;
  appendFileSync(gitignorePath, block, "utf-8");

  const action = existing === "" ? "Created" : "Updated";
  console.log(`  ✓ .gitignore ${action.toLowerCase()} (added ${missing.length} assignr entr${missing.length === 1 ? "y" : "ies"})`);
}

export async function initCommand(options: {
  force: boolean;
  cwd: string;
  root: string;
}): Promise<void> {
  const { force, cwd, root } = options;
  const p = getPaths(cwd, root);

  const dirs = [
    p.root,
    p.specs,
    p.specsTasks,
    p.specsDomains,
    p.specsContracts,
    p.tasksActive,
    p.tasksCompleted,
    p.tasksArchived,
    p.prompts,
    p.promptsTemplates,
    p.promptsGenerated,
    p.runs,
    p.state,
    p.commands,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const filesToCreate: Array<{ path: string; content: string }> = [
    { path: p.config, content: CONFIG_YAML },
    { path: `${p.specsDomains}/core.yaml`, content: CORE_DOMAIN_YAML },
    { path: `${p.promptsTemplates}/implementation.md`, content: IMPLEMENTATION_TEMPLATE },
    { path: `${p.promptsTemplates}/review.md`, content: REVIEW_TEMPLATE },
    { path: `${p.promptsTemplates}/test.md`, content: TEST_TEMPLATE },
    { path: p.stateFile, content: STATE_JSON },
    { path: `${p.commands}/README.md`, content: COMMANDS_README },
  ];

  const created: string[] = [];
  const skipped: string[] = [];

  for (const { path, content } of filesToCreate) {
    const isCoreDomain = path === `${p.specsDomains}/core.yaml`;
    if (existsSync(path) && (!force || isCoreDomain)) {
      skipped.push(path);
    } else {
      writeFileSync(path, content, "utf-8");
      created.push(path);
    }
  }

  for (const dir of dirs) {
    console.log(`  ✓ ${dir.replace(cwd + "/", "")}/`);
  }
  for (const f of created) {
    console.log(`  ✓ ${f.replace(cwd + "/", "")}`);
  }
  if (skipped.length > 0) {
    console.log(`\n  Skipped (already exist):`);
    for (const f of skipped) {
      console.log(`  - ${f.replace(cwd + "/", "")}`);
    }
  }

  updateGitignore(cwd, root);

  console.log(`\nAssignr initialized at ${root}/`);
}
