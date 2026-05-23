#!/usr/bin/env node
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, "../dist/cli.js");

if (!existsSync(distEntry)) {
  console.error("Error: dist/cli.js not found. Run \`pnpm build\` first.");
  process.exit(1);
}

await import(distEntry);
