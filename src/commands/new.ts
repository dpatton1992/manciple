import { createInterface } from "readline/promises";
import { stdin as defaultInput, stdout as defaultOutput } from "process";
import type { Readable, Writable } from "stream";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { slugify } from "../utils/slugify.js";
import { formatYamlDocument } from "../utils/yamlFormat.js";
import { TASK_TYPES, PRIORITIES } from "../constants.js";
import type { TaskType, Priority } from "../constants.js";

export interface NewTaskOptions {
  type: TaskType;
  domain: string;
  priority: Priority;
  goal?: string;
  implementationNotes?: string[];
  cwd: string;
  activeDir: string;
}

export type PromptQuestion = (prompt: string) => Promise<string>;

export interface NewTaskInteractiveOptions extends NewTaskOptions {
  input?: Readable;
  output?: Writable;
  question?: PromptQuestion;
}

interface NewTaskSpecValues {
  acceptanceCriteria: string[];
  verificationCommands: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  outputsRequired: string[];
  implementationNotes: string[];
  notes: string[];
}

const defaultSpecValues: NewTaskSpecValues = {
  acceptanceCriteria: ["TODO: add acceptance criteria"],
  verificationCommands: ["TODO: add verification commands"],
  allowedPaths: ["TODO: add allowed paths"],
  forbiddenPaths: ["TODO: add forbidden paths"],
  outputsRequired: [
    "files_changed",
    "tests_run",
    "risks",
    "follow_up_tasks",
  ],
  implementationNotes: ["TODO: add behavior, product, or design constraints."],
  notes: ["TODO: add any notes or constraints."],
};

function createTaskSpec(
  title: string,
  id: string,
  options: NewTaskOptions,
  values: NewTaskSpecValues = defaultSpecValues,
) {
  const { type, domain, priority, goal } = options;
  const goalValue = goal !== undefined
    ? (() => {
        const trimmed = goal.trim();
        if (!trimmed) {
          console.error("Error: --goal value must not be empty.");
          process.exit(1);
        }
        return trimmed;
      })()
    : "TODO: describe the goal of this task.";

  return {
    id,
    title,
    status: "pending",
    type,
    domain,
    priority,
    depends_on: [] as string[],
    allowed_paths: values.allowedPaths,
    forbidden_paths: values.forbiddenPaths,
    goal: goalValue,
    acceptance_criteria: values.acceptanceCriteria,
    implementation_notes: options.implementationNotes ?? values.implementationNotes,
    verification: {
      commands: values.verificationCommands,
    },
    outputs_required: values.outputsRequired,
    notes: values.notes,
  };
}

function writeTaskFile(title: string, options: NewTaskOptions, values?: NewTaskSpecValues): string {
  const { cwd, activeDir } = options;
  const id = slugify(title);

  if (!id) {
    console.error("Error: could not generate a valid id from the provided title.");
    process.exit(1);
  }

  const filePath = join(activeDir, `${id}.yaml`);

  if (existsSync(filePath)) {
    console.error(`Error: task spec already exists at ${filePath.replace(cwd + "/", "")}`);
    process.exit(1);
  }

  if (!existsSync(activeDir)) {
    mkdirSync(activeDir, { recursive: true });
  }

  const spec = createTaskSpec(title, id, options, values);
  const yaml = formatYamlDocument(spec);
  writeFileSync(filePath, yaml, "utf-8");

  console.log(`Created: ${filePath.replace(cwd + "/", "")}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit the spec: ${filePath.replace(cwd + "/", "")}`);
  console.log(`  2. Run: assignr validate`);
  console.log(`  3. Run: assignr compile ${id}`);

  return filePath;
}

function validateChoice<T extends readonly string[]>(value: string, allowed: T, label: string): T[number] {
  if (allowed.includes(value)) {
    return value as T[number];
  }
  console.error(`Invalid ${label}: "${value}". Allowed: ${allowed.join(", ")}`);
  process.exit(1);
}

async function askRequired(question: PromptQuestion, prompt: string): Promise<string> {
  while (true) {
    const value = (await question(prompt)).trim();
    if (value) {
      return value;
    }
    console.log("Please enter a value.");
  }
}

async function askWithDefault(question: PromptQuestion, prompt: string, defaultValue: string): Promise<string> {
  const value = (await question(`${prompt} [${defaultValue}]: `)).trim();
  return value || defaultValue;
}

async function askList(question: PromptQuestion, label: string, required: boolean): Promise<string[]> {
  const values: string[] = [];

  while (true) {
    const suffix = values.length === 0 ? "" : " (blank to finish)";
    const value = (await question(`${label}${suffix}: `)).trim();
    if (!value) {
      if (required && values.length === 0) {
        console.log("Please enter at least one value.");
        continue;
      }
      return values;
    }
    values.push(value);
  }
}

export function newCommand(title: string, options: NewTaskOptions): void {
  writeTaskFile(title, options);
}

export async function newInteractiveCommand(
  title: string | undefined,
  options: NewTaskInteractiveOptions,
): Promise<void> {
  const readline = options.question
    ? undefined
    : createInterface({
        input: options.input ?? defaultInput,
        output: options.output ?? defaultOutput,
      });
  const question = options.question ?? ((prompt: string) => readline!.question(prompt));

  try {
    const interactiveTitle = title?.trim() || (await askRequired(question, "Title: "));
    const goal = options.goal
      ? await askWithDefault(question, "Goal", options.goal)
      : await askRequired(question, "Goal: ");
    const typeValue = await askWithDefault(question, `Type (${TASK_TYPES.join(", ")})`, options.type);
    const domain = await askWithDefault(question, "Domain", options.domain);
    const priorityValue = await askWithDefault(question, `Priority (${PRIORITIES.join(", ")})`, options.priority);
    const values: NewTaskSpecValues = {
      acceptanceCriteria: await askList(question, "Acceptance criterion", true),
      verificationCommands: await askList(question, "Verification command", true),
      allowedPaths: await askList(question, "Allowed path", false),
      forbiddenPaths: await askList(question, "Forbidden path", false),
      outputsRequired: await askList(question, "Output required", false),
      implementationNotes: options.implementationNotes ?? [],
      notes: await askList(question, "Note", false),
    };

    writeTaskFile(interactiveTitle, {
      ...options,
      goal,
      type: validateChoice(typeValue, TASK_TYPES, "type"),
      domain,
      priority: validateChoice(priorityValue, PRIORITIES, "priority"),
    }, values);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: interactive task creation failed: ${message}`);
    process.exit(1);
  } finally {
    readline?.close();
  }
}
