import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, relative } from "path";
import { spawnSync } from "child_process";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { STATUSES } from "./constants.js";
import type { Status } from "./constants.js";
import { loadTasks } from "./specs/loadTasks.js";
import { validateTasks } from "./specs/validateTasks.js";
import {
  IMPLEMENTATION_TEMPLATE,
  REVIEW_TEMPLATE,
  TEST_TEMPLATE,
  renderTemplate,
} from "./templates/renderTemplate.js";
import { getPaths } from "./utils/paths.js";
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

function findTask(taskId: string): LoadedTask | undefined {
  return loadTasks(p.specsTasks).tasks.find((task) => task.spec.id === taskId);
}

function loadTasksOrError(): LoadedTask[] {
  const { tasks, errors } = loadTasks(p.specsTasks);
  if (errors.length > 0) {
    const message = errors
      .map((error) => `${relative(cwd, error.filePath)}: ${error.error}`)
      .join("; ");
    throw new Error(`Cannot load tasks: ${message}`);
  }
  return tasks;
}

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")
    .replace("T", "-");
}

function currentBranch(): string {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf-8",
  });
  if (result.status !== 0 || !result.stdout) return "unknown";
  return result.stdout.trim() || "unknown";
}

function buildRunLog(title: string, id: string, status: string): string {
  const promptPath = `${p.promptsGenerated}/${id}.md`;
  return `# Run Log: ${title}

## Metadata

- Task ID: ${id}
- Status: ${status}
- Started: ${new Date().toISOString()}
- Agent/Harness: TODO
- Model: TODO
- Branch: ${currentBranch()}

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
      domain: z.string().optional(),
    },
  },
  ({ status, domain }) =>
    toolResult(() => {
      let tasks = loadTasksOrError();
      if (status) tasks = tasks.filter((task) => task.spec.status === status);
      if (domain) tasks = tasks.filter((task) => task.spec.domain === domain);

      return jsonResult(
        tasks.map(({ spec }) => ({
          id: spec.id,
          title: spec.title,
          status: spec.status,
          domain: spec.domain,
          priority: spec.priority,
          dep_count: spec.depends_on?.length ?? 0,
        }))
      );
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
      const { tasks, errors: loadErrors } = loadTasks(p.specsTasks);
      const { valid, invalid } = validateTasks(tasks);
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
        errors,
      });
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
      const tasks = loadTasksOrError();
      const found = tasks.find((task) => task.spec.id === task_id);
      if (!found) return errorResult(`Task not found: ${task_id}`);

      if (!existsSync(p.promptsGenerated)) {
        mkdirSync(p.promptsGenerated, { recursive: true });
      }

      const content = renderTemplate(getTemplate(found.spec.type), found.spec);
      const outputPath = join(p.promptsGenerated, `${found.spec.id}.md`);
      writeFileSync(outputPath, content, "utf-8");

      return jsonResult({ output_path: outputPath, content });
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
    description: "Create a run log stub for one Assignr task.",
    inputSchema: {
      task_id: z.string(),
    },
  },
  ({ task_id }) =>
    toolResult(() => {
      const tasks = loadTasksOrError();
      const found = tasks.find((task) => task.spec.id === task_id);
      if (!found) return errorResult(`Task not found: ${task_id}`);

      if (!existsSync(p.runs)) {
        mkdirSync(p.runs, { recursive: true });
      }

      const outPath = join(p.runs, `${timestamp()}-${found.spec.id}.md`);
      writeFileSync(outPath, buildRunLog(found.spec.title, found.spec.id, found.spec.status), "utf-8");

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
