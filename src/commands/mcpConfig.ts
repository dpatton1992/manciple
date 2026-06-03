import { existsSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

function assignrMcpBinPath(): string {
  const commandDir = dirname(fileURLToPath(import.meta.url));
  return join(commandDir, "..", "..", "bin", "assignr-mcp.js");
}

function mcpServerName(cwd: string): string {
  const repoDir = basename(cwd);
  return `assignr-${repoDir}`;
}

export function mcpConfigCommand(options: { cwd: string; force: boolean }): void {
  const { cwd, force } = options;
  const configPath = join(cwd, ".mcp.json");
  const serverKey = mcpServerName(cwd);

  let config: McpConfig = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as McpConfig;
    } catch (err) {
      console.error(
        `Could not parse ${relative(cwd, configPath)}: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exit(1);
    }
  }

  const mcpServers = config.mcpServers ?? {};
  if (typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    console.error(`Invalid ${relative(cwd, configPath)}: "mcpServers" must be an object.`);
    process.exit(1);
  }

  if (Object.prototype.hasOwnProperty.call(mcpServers, serverKey) && !force) {
    console.error(
      `${relative(cwd, configPath)} already has an "${serverKey}" MCP server. Use --force to overwrite it.`
    );
    process.exit(1);
  }

  config.mcpServers = {
    ...mcpServers,
    [serverKey]: {
      command: "node",
      args: [assignrMcpBinPath()],
      cwd,
    },
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  console.log(`Wrote MCP config: ${relative(cwd, configPath)}`);
}
