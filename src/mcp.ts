import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative } from "path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { STATUSES, TASK_TYPES, PRIORITIES } from "./constants.js";
import type { Status } from "./constants.js";
import { slugify } from "./utils/slugify.js";
import { loadTasks } from "./specs/loadTasks.js";
import { pathOwnershipWarningsForTask } from "./specs/loadTasks.js";
import type { LoadedTaskWithTier } from "./specs/loadTasks.js";
import { validateTasks } from "./specs/validateTasks.js";
import { listTasksForMcp } from "./mcpList.js";
import { buildRunLog, timestamp } from "./commands/runLog.js";
import { checkLifecyclePlacement } from "./lifecycle/placement.js";
import {
  IMPLEMENTATION_TEMPLATE,
  REVIEW_TEMPLATE,
  TEST_TEMPLATE,
  renderDomainContext,
  renderTemplate,
} from "./templates/renderTemplate.js";
import { getPaths } from "./utils/paths.js";
import { TaskSpecSchema } from "./specs/schema.js";
import type { LoadedTask, TaskSpec } from "./specs/schema.js";

const cwd = process.cwd();
const config = loadConfig(cwd);
const root = config.root;
const p = getPaths(cwd, root);

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
  };
}

async function toolResult(fn: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

function getTemplate(type: TaskSpec["type"]): string {
  switch (type) {
    case "review":
      return REVIEW_TEMPLATE;
    case "test":
      return TEST_TEMPLATE;
    default:
      return IMPLEMENTATION_TEMPLATE;
  }
}

function loadDomainContextForPaths(
  domain: string,
  specsDomainsDir: string,
  cwdForRelativePaths: string
): { content?: string; warning?: string } {
  const domainPath = join(specsDomainsDir, `${domain}.yaml`);

  if (!existsSync(domainPath)) {
    return {
      warning: `Optional domain context not found for "${domain}" at ${relative(cwdForRelativePaths, domainPath)}; compiled without domain context.`,
    };
  }

  const raw = readFileSync(domainPath, "utf-8");
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return { content: renderDomainContext(parsed as Record<string, unknown>) };
}

function findTask(taskId: string): LoadedTask | undefined {
  return loadTasks(p.specsTasks, "all").tasks.find((task) => task.spec.id === taskId);
}

function loadTasksOrError(): LoadedTaskWithTier[] {
  const { tasks, errors } = loadTasks(p.specsTasks, "all");
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${relative(cwd, error.filePath)}: ${error.error}`)
      .join("; ");
    throw new Error(`Cannot load tasks: ${message}`);
  }
  return tasks;
}

export interface CompileTaskForMcpOptions {
  taskId: string;
  specsTasksDir: string;
  specsDomainsDir: string;
  promptsGeneratedDir: string;
  cwd: string;
}

export function compileTaskForMcp(options: CompileTaskForMcpOptions): {
  output_path: string;
  content: string;
  path_ownership_warnings: ReturnType<typeof pathOwnershipWarningsForTask>;
  warning?: string;
} {
  const { taskId, specsTasksDir, specsDomainsDir, promptsGeneratedDir, cwd } = options;
  const { tasks, errors } = loadTasks(specsTasksDir, "all");
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${relative(cwd, error.filePath)}: ${error.error}`)
      .join("; ");
    throw new Error(`Cannot load tasks: ${message}`);
  }

  const found = tasks.find((task) => task.spec.id === taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);

  const pathOwnershipWarnings = pathOwnershipWarningsForTask(found, tasks);

  if (!existsSync(promptsGeneratedDir)) {
    mkdirSync(promptsGeneratedDir, { recursive: true });
  }

  const domainContext = loadDomainContextForPaths(found.spec.domain, specsDomainsDir, cwd);
  const content = renderTemplate(getTemplate(found.spec.type), found.spec, domainContext.content);
  const outputPath = join(promptsGeneratedDir, `${found.spec.id}.md`);
  writeFileSync(outputPath, content, "utf-8");

  return {
    output_path: outputPath,
    content,
    path_ownership_warnings: pathOwnershipWarnings,
    ...(domainContext.warning ? { warning: domainContext.warning } : {}),
  };
}

function dependencyContextTask(task: LoadedTaskWithTier): LoadedTaskWithTier {
  return {
    ...task,
    spec: {
      ...task.spec,
      depends_on: [],
      allowed_paths: ["dependency-context"],
      forbidden_paths: ["dependency-context"],
      outputs_required: ["dependency-context"],
      notes: ["Loaded only so active task dependency references can be resolved."],
    },
  };
}

function loadActiveValidationTasks(): {
  tasks: LoadedTaskWithTier[];
  errors: Array<{ filePath: string; error: string }>;
  activeFilePaths: Set<string>;
} {
  const activeResult = loadTasks(p.specsTasks, "active");
  const allResult = loadTasks(p.specsTasks, "all");
  const activeIds = new Set(activeResult.tasks.map((task) => task.spec.id));
  const activeFilePaths = new Set(activeResult.tasks.map((task) => task.filePath));
  const contextTasks = allResult.tasks
    .filter((task) => !activeIds.has(task.spec.id))
    .map(dependencyContextTask);

  return {
    tasks: [...activeResult.tasks, ...contextTasks],
    errors: activeResult.errors,
    activeFilePaths,
  };
}

const server = new McpServer({
  name: "assignr",
  version: "0.1.0",
});

server.registerTool(
  "assignr_list",
  {
    title: "List Assignr Tasks",
    description: "List Assignr tasks, optionally filtered by status or domain.",
    inputSchema: {
      status: z.string().optional(),
      tier: z.enum(["active", "completed", "archived", "all"]).optional(),
      domain: z.string().optional(),
    },
  },
  ({ status, tier, domain }) =>
    toolResult(() => {
      return jsonResult(listTasksForMcp(p.specsTasks, cwd, { status, tier, domain }));
    })
);

server.registerTool(
  "assignr_validate",
  {
    title: "Validate Assignr Tasks",
    description: "Run schema and semantic validation for Assignr task specs.",
  },
  () =>
    toolResult(() => {
      const {
        tasks,
        errors: loadErrors,
        activeFilePaths,
      } = loadActiveValidationTasks();
      const result = validateTasks(tasks, {
        specsDomainsDir: p.specsDomains,
        countFilePaths: activeFilePaths,
      });
      const valid = result.valid.filter((task) => activeFilePaths.has(task.filePath));
      const invalid = result.invalid.filter((entry) => activeFilePaths.has(entry.filePath));
      const errors = [
        ...loadErrors.map((error) => ({
          file: relative(cwd, error.filePath),
          message: error.error,
        })),
        ...invalid.flatMap(({ filePath, errors: issues }) =>
          issues.map((issue) => ({
            file: relative(cwd, filePath),
            message: `[${issue.field}] ${issue.message}`,
          }))
        ),
      ];

      return jsonResult({
        valid_count: valid.length,
        error_count: errors.length,
        counts: {
          tasks_checked: result.counts.tasksChecked + loadErrors.length,
          domains_checked: result.counts.domainsChecked,
          contracts_checked: result.counts.contractsChecked + loadErrors.length,
        },
        errors,
      });
    })
);

server.registerTool(
  "assignr_check_lifecycle",
  {
    title: "Check Assignr Lifecycle Placement",
    description: "Validate that task files live in the lifecycle directory matching their status.",
  },
  () =>
    toolResult(() => {
      return jsonResult(
        checkLifecyclePlacement({
          cwd,
          activeDir: p.tasksActive,
          completedDir: p.tasksCompleted,
          archivedDir: p.tasksArchived,
        })
      );
    })
);

server.registerTool(
  "assignr_create",
  {
    title: "Create Assignr Task",
    description:
      "Create a new Assignr task spec in the active tasks directory. Generates the task id from the title using slugify. Returns an error if a task with the same id already exists.",
    inputSchema: {
      title: z.string().min(1).describe("Human-readable task title. The id is derived from this."),
      type: z.enum(TASK_TYPES).describe("Task type."),
      domain: z.string().min(1).describe("Domain label, e.g. auth, core, api."),
      priority: z.enum(PRIORITIES).optional().describe("Task priority. Defaults to medium."),
      goal: z.string().min(1).describe("One sentence describing what is done when this task is complete."),
      acceptance_criteria: z.array(z.string()).min(1).describe("Specific, testable criteria the implementation must satisfy."),
      verification_commands: z.array(z.string()).min(1).describe("Shell commands to verify the work. Must be runnable in the repo as-is."),
      allowed_paths: z.array(z.string()).optional().describe("Glob patterns or exact paths the agent may edit."),
      forbidden_paths: z.array(z.string()).optional().describe("Paths the agent must not touch."),
      depends_on: z.array(z.string()).optional().describe("IDs of tasks that must complete before this one starts."),
      outputs_required: z.array(z.string()).optional().describe("Evidence fields the agent must report. Defaults to files_changed, tests_run, risks."),
      notes: z.array(z.string()).optional().describe("Free-form notes or constraints."),
    },
  },
  ({
    title,
    type,
    domain,
    priority,
    goal,
    acceptance_criteria,
    verification_commands,
    allowed_paths,
    forbidden_paths,
    depends_on,
    outputs_required,
    notes,
  }) =>
    toolResult(() => {
      const id = slugify(title);

      const existing = findTask(id);
      if (existing) {
        return errorResult(
          `A task with id "${id}" already exists at ${relative(cwd, existing.filePath)}. Choose a different title or update the existing task.`
        );
      }

      const spec = {
        id,
        title,
        status: "pending" as const,
        type,
        domain,
        priority: priority ?? "medium",
        depends_on: depends_on ?? [],
        allowed_paths: allowed_paths ?? [],
        forbidden_paths: forbidden_paths ?? [],
        goal,
        acceptance_criteria,
        verification: { commands: verification_commands },
        outputs_required: outputs_required ?? ["files_changed", "tests_run", "risks"],
        notes: notes ?? [],
      };

      const parsed = TaskSpecSchema.safeParse(spec);
      if (!parsed.success) {
        const messages = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return errorResult(`Invalid task spec: ${messages}`);
      }

      if (!existsSync(p.tasksActive)) {
        mkdirSync(p.tasksActive, { recursive: true });
      }

      const filePath = join(p.tasksActive, `${id}.yaml`);
      writeFileSync(filePath, stringify(parsed.data, { lineWidth: 0 }), "utf-8");

      return jsonResult({ id, file_path: relative(cwd, filePath) });
    })
);

server.registerTool(
  "assignr_get_task",
  {
    title: "Get Assignr Task",
    description: "Read a task YAML file and return the parsed task spec.",
    inputSchema: {
      task_id: z.string(),
    },
  },
  ({ task_id }) =>
    toolResult(() => {
      const found = findTask(task_id);
      if (!found) return errorResult(`Task not found: ${task_id}`);

      const raw = readFileSync(found.filePath, "utf-8");
      const parsed = parse(raw);
      return jsonResult(parsed);
    })
);

server.registerTool(
  "assignr_compile",
  {
    title: "Compile Assignr Task",
    description: "Compile one Assignr task into a generated markdown prompt.",
    inputSchema: {
      task_id: z.string(),
    },
  },
  ({ task_id }) =>
    toolResult(() => {
      try {
        return jsonResult({
          ...compileTaskForMcp({
            taskId: task_id,
            specsTasksDir: p.specsTasks,
            specsDomainsDir: p.specsDomains,
            promptsGeneratedDir: p.promptsGenerated,
            cwd,
          }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === `Task not found: ${task_id}`) return errorResult(message);
        throw err;
      }
    })
);

server.registerTool(
  "assignr_set_status",
  {
    title: "Set Assignr Task Status",
    description: "Update the status field for one Assignr task YAML file.",
    inputSchema: {
      task_id: z.string(),
      status: z.string(),
    },
  },
  ({ task_id, status }) =>
    toolResult(() => {
      if (!STATUSES.includes(status as Status)) {
        return errorResult(`Invalid status: "${status}". Allowed: ${STATUSES.join(", ")}`);
      }

      const found = findTask(task_id);
      if (!found) return errorResult(`Task not found: ${task_id}`);

      const raw = readFileSync(found.filePath, "utf-8");
      const parsed = parse(raw) as Record<string, unknown>;
      const previousStatus = parsed["status"];
      parsed["status"] = status;
      writeFileSync(found.filePath, stringify(parsed, { lineWidth: 0 }), "utf-8");

      return jsonResult({
        previous_status: previousStatus,
        new_status: status,
        file: found.filePath,
      });
    })
);

server.registerTool(
  "assignr_run_log",
  {
    title: "Create Assignr Run Log",
    description:
      "Create a run log for one Assignr task. Pass agent context fields when available so the log is populated rather than left as TODO stubs.",
    inputSchema: {
      task_id: z.string(),
      agent: z.string().optional().describe("The agent harness or tool used (e.g. 'Claude Code', 'Cursor')."),
      model: z.string().optional().describe("The model that performed the work (e.g. 'claude-sonnet-4-5')."),
      files_changed: z.array(z.string()).optional().describe("List of file paths modified during the run."),
      commands_run: z.array(z.string()).optional().describe("List of shell commands executed during the run."),
      result: z
        .enum(["complete", "partial", "blocked", "failed"])
        .optional()
        .describe("Outcome of the run."),
      risks: z.string().optional().describe("Risks or residual concerns from the run."),
      notes: z.string().optional().describe("Free-form notes about the run."),
    },
  },
  ({ task_id, agent, model, files_changed, commands_run, result, risks, notes }) =>
    toolResult(() => {
      const tasks = loadTasksOrError();
      const found = tasks.find((task) => task.spec.id === task_id);
      if (!found) return errorResult(`Task not found: ${task_id}`);

      if (!existsSync(p.runs)) {
        mkdirSync(p.runs, { recursive: true });
      }

      const outPath = join(p.runs, `${timestamp()}-${found.spec.id}.md`);
      writeFileSync(
        outPath,
        buildRunLog(found.spec.title, found.spec.id, found.spec.status, p.promptsGenerated, cwd, {
          agent,
          model,
          filesChanged: files_changed,
          commandsRun: commands_run,
          result,
          risks,
          notes,
        }),
        "utf-8"
      );

      return jsonResult({ path: outPath });
    })
);

server.registerTool(
  "assignr_get_compiled_prompt",
  {
    title: "Get Compiled Assignr Prompt",
    description: "Read an existing compiled prompt for one Assignr task.",
    inputSchema: {
      task_id: z.string(),
    },
  },
  ({ task_id }) =>
    toolResult(() => {
      const promptPath = join(p.promptsGenerated, `${task_id}.md`);
      if (!existsSync(promptPath)) {
        return errorResult(`Compiled prompt not found for task: ${task_id}`);
      }

      return jsonResult({ content: readFileSync(promptPath, "utf-8") });
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
