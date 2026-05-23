import { existsSync } from "fs";

export function fileExists(path: string): boolean {
  return existsSync(path);
}
