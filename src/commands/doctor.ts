import { createRequire } from "module";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import { getPaths } from "../utils/paths.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function check(label: string, ok: boolean, detail?: string): CheckResult {
  return { label, ok, detail };
}

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function countYamlFiles(path: string): number {
  if (!directoryExists(path)) {
    return 0;
  }

  return readdirSync(path).filter((file) => file.endsWith(".yaml")).length;
}

function relativeToCwd(cwd: string, path: string): string {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

export function doctorCommand(cwd: string, root: string): void {
  const projectRoot = resolve(cwd);
  const p = getPaths(projectRoot, root);
  const results: CheckResult[] = [];

  const activeTaskCount = countYamlFiles(p.tasksActive);

  let configReadable = false;
  let configReadError: string | undefined;
  if (existsSync(p.config)) {
    try {
      readFileSync(p.config, "utf-8");
      configReadable = true;
    } catch (err) {
      configReadError = err instanceof Error ? err.message : String(err);
    }
  }

  results.push(check("config.yaml readable", configReadable, configReadError));
  results.push(check("tasks/active/ exists", directoryExists(p.tasksActive)));
  results.push(check("tasks/completed/ exists", directoryExists(p.tasksCompleted)));
  results.push(check("tasks/archived/ exists", directoryExists(p.tasksArchived)));

  console.log("Assignr Doctor");
  console.log("────────────────");
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Assignr root: ${p.root}`);
  console.log(`  Package version: ${version}`);
  console.log(`  Active tasks: ${activeTaskCount}`);
  console.log();

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "✓" : "✕";
    const detail = r.detail ? `  (${r.detail})` : "";
    console.log(`  ${icon} ${r.label}${detail}`);
    if (!r.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log("All checks passed. Assignr is configured correctly.");
  } else {
    console.log(`Some checks failed. Run "assignr init" to fix missing structure under ${relativeToCwd(projectRoot, p.root)}/.`);
    process.exit(1);
  }
}
