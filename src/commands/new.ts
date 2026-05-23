import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { stringify } from "yaml";
import { slugify } from "../utils/slugify.js";
import type { TaskType, Priority } from "../constants.js";

export interface NewTaskOptions {
  type: TaskType;
  domain: string;
  priority: Priority;
  cwd: string;
  specsTasksDir: string;
}

export function newCommand(title: string, options: NewTaskOptions): void {
  const { type, domain, priority, cwd, specsTasksDir } = options;
  const id = slugify(title);

  if (!id) {
    console.error("Error: could not generate a valid id from the provided title.");
    process.exit(1);
  }

  const filePath = join(specsTasksDir, `${id}.yaml`);

  if (existsSync(filePath)) {
    console.error(`Error: task spec already exists at ${filePath.replace(cwd + "/", "")}`);
    process.exit(1);
  }

  if (!existsSync(specsTasksDir)) {
    mkdirSync(specsTasksDir, { recursive: true });
  }

  const spec = {
    id,
    title,
    status: "pending",
    type,
    domain,
    priority,
    depends_on: [] as string[],
    allowed_paths: ["TODO: add allowed paths"],
    forbidden_paths: ["TODO: add forbidden paths"],
    goal: "TODO: describe the goal of this task.",
    acceptance_criteria: ["TODO: add acceptance criteria"],
    verification: {
      commands: ["TODO: add verification commands"],
    },
    outputs_required: [
      "files_changed",
      "tests_run",
      "risks",
      "follow_up_tasks",
    ],
    notes: ["TODO: add any notes or constraints."],
  };

  const yaml = stringify(spec, { lineWidth: 0 });
  writeFileSync(filePath, yaml, "utf-8");

  console.log(`Created: ${filePath.replace(cwd + "/", "")}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit the spec: ${filePath.replace(cwd + "/", "")}`);
  console.log(`  2. Run: promptops validate`);
  console.log(`  3. Run: promptops compile ${id}`);
}
