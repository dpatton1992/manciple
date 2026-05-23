import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { loadTasks } from "../specs/loadTasks.js";

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")
    .replace("T", "-");
}

function buildRunLog(title: string, id: string, status: string, generatedDir: string): string {
  const promptPath = `${generatedDir}/${id}.md`;
  return `# Run Log: ${title}

## Metadata

- Task ID: ${id}
- Status: ${status}
- Started: ${new Date().toISOString()}
- Agent/Harness: TODO
- Model: TODO
- Branch: TODO

## Prompt Used

- Generated prompt path: ${promptPath}

## Files Changed

TODO: list files changed during this run.

## Commands Run

TODO: list commands run during this run.

## Result

<!-- complete | partial | blocked | failed -->
TODO

## Risks

TODO

## Follow-Up Tasks

TODO

## Notes

TODO
`;
}

export function runLogCommand(
  taskId: string,
  specsTasksDir: string,
  runsDir: string,
  generatedDir: string,
  cwd: string
): void {
  const { tasks, errors } = loadTasks(specsTasksDir);

  if (errors.length > 0) {
    console.warn(`⚠ ${errors.length} task(s) failed to load.`);
  }

  const found = tasks.find((t) => t.spec.id === taskId);

  if (!found) {
    console.error(
      `Task not found: ${taskId}\nRun "promptops status" to see available tasks.`
    );
    process.exit(1);
  }

  const { spec } = found;

  if (!existsSync(runsDir)) {
    mkdirSync(runsDir, { recursive: true });
  }

  const ts = timestamp();
  const outPath = join(runsDir, `${ts}-${taskId}.md`);
  const content = buildRunLog(spec.title, spec.id, spec.status, generatedDir);

  writeFileSync(outPath, content, "utf-8");
  console.log(`Created run log: ${outPath.replace(cwd + "/", "")}`);
}
