import { join } from "path";

export interface AssignrPaths {
  root: string;
  config: string;
  specs: string;
  specsTasks: string;
  specsDomains: string;
  specsContracts: string;
  tasksActive: string;
  tasksCompleted: string;
  tasksArchived: string;
  prompts: string;
  promptsTemplates: string;
  promptsGenerated: string;
  runs: string;
  state: string;
  stateFile: string;
  commands: string;
}

export function getPaths(cwd: string, root: string): AssignrPaths {
  const r = join(cwd, root);
  return {
    root: r,
    config: join(r, "config.yaml"),
    specs: join(r, "specs"),
    specsTasks: join(r, "specs", "tasks"),
    specsDomains: join(r, "specs", "domains"),
    specsContracts: join(r, "specs", "contracts"),
    tasksActive: join(r, "tasks", "active"),
    tasksCompleted: join(r, "tasks", "completed"),
    tasksArchived: join(r, "tasks", "archived"),
    prompts: join(r, "prompts"),
    promptsTemplates: join(r, "prompts", "templates"),
    promptsGenerated: join(r, "prompts", "generated"),
    runs: join(r, "runs"),
    state: join(r, "state"),
    stateFile: join(r, "state", "tasks.json"),
    commands: join(r, "commands"),
  };
}
