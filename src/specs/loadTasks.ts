import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { TaskSpecSchema } from "./schema.js";
import type { LoadedTask } from "./schema.js";

export interface LoadResult {
  tasks: LoadedTask[];
  errors: Array<{ filePath: string; error: string }>;
}

export function loadTasks(specsTasksDir: string): LoadResult {
  if (!existsSync(specsTasksDir)) {
    return { tasks: [], errors: [] };
  }

  const files = readdirSync(specsTasksDir).filter((f) => f.endsWith(".yaml"));
  const tasks: LoadedTask[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];

  for (const file of files) {
    const filePath = join(specsTasksDir, file);
    const raw = readFileSync(filePath, "utf-8");

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (err) {
      errors.push({
        filePath,
        error: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const result = TaskSpecSchema.safeParse(parsed);
    if (!result.success) {
      const messages = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      errors.push({ filePath, error: messages });
      continue;
    }

    tasks.push({ spec: result.data, filePath });
  }

  return { tasks, errors };
}
