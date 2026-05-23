import { existsSync } from "fs";
import { loadTasks } from "../specs/loadTasks.js";
import { validateTasks } from "../specs/validateTasks.js";
import { getPaths } from "../utils/paths.js";

interface CheckResult {
  label: string;
  ok: boolean;
  detail?: string;
}

function check(label: string, ok: boolean, detail?: string): CheckResult {
  return { label, ok, detail };
}

export function doctorCommand(cwd: string, root: string): void {
  const p = getPaths(cwd, root);
  const results: CheckResult[] = [];

  results.push(check("config.yaml exists", existsSync(p.config)));
  results.push(check("specs/tasks/ exists", existsSync(p.specsTasks)));
  results.push(check("tasks/active/ exists", existsSync(p.tasksActive)));
  results.push(check("prompts/templates/ exists", existsSync(p.promptsTemplates)));
  results.push(check("prompts/generated/ exists", existsSync(p.promptsGenerated)));
  results.push(check("runs/ exists", existsSync(p.runs)));
  results.push(check("state/tasks.json exists", existsSync(p.stateFile)));

  const implTemplate = `${p.promptsTemplates}/implementation.md`;
  const reviewTemplate = `${p.promptsTemplates}/review.md`;
  const testTemplate = `${p.promptsTemplates}/test.md`;
  results.push(check("template: implementation.md", existsSync(implTemplate)));
  results.push(check("template: review.md", existsSync(reviewTemplate)));
  results.push(check("template: test.md", existsSync(testTemplate)));

  // Run task validation
  const { tasks, errors: loadErrors } = loadTasks(p.specsTasks);
  if (loadErrors.length > 0) {
    results.push(
      check(
        "task specs valid",
        false,
        `${loadErrors.length} file(s) failed to parse`
      )
    );
  } else if (tasks.length === 0) {
    results.push(check("task specs exist", true, "0 tasks found (none created yet)"));
  } else {
    const { invalid } = validateTasks(tasks, { specsDomainsDir: p.specsDomains });
    results.push(
      check(
        "task specs valid",
        invalid.length === 0,
        invalid.length > 0 ? `${invalid.length} invalid task(s)` : `${tasks.length} task(s) OK`
      )
    );
  }

  console.log("Assignr Doctor");
  console.log("────────────────");

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
    console.log('Some checks failed. Run "assignr init" to fix missing structure.');
    process.exit(1);
  }
}
