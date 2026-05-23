import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { DEFAULT_ROOT } from "./constants.js";

export interface AssignrConfig {
  root: string;
}

export function loadConfig(cwd: string = process.cwd()): AssignrConfig {
  const configPath = join(cwd, DEFAULT_ROOT, "config.yaml");
  if (!existsSync(configPath)) {
    return { root: DEFAULT_ROOT };
  }
  const raw = readFileSync(configPath, "utf-8");
  const parsed = parse(raw) as Partial<AssignrConfig> | null;
  return {
    root: parsed?.root ?? DEFAULT_ROOT,
  };
}
