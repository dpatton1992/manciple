#!/usr/bin/env node
// Entry shim — runs compiled CLI or falls back to tsx in development.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, "../dist/cli.js");

if (existsSync(distEntry)) {
  await import(distEntry);
} else {
  // Dev fallback: run with tsx
  const { spawnSync } = await import("child_process");
  const src = join(__dirname, "../src/cli.ts");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", src, ...process.argv.slice(2)],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 1);
}
