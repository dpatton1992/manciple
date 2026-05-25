import { spawnSync } from "child_process";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const result = spawnSync("vitest", ["run", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
