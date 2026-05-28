import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { McpServerInfo } from "./webview-protocol";

const execFileAsync = promisify(execFile);

export async function readProjectMcpServers(projectPath: string): Promise<McpServerInfo[]> {
  const mcpJsonPath = path.join(projectPath, ".mcp.json");
  try {
    const raw = await fs.readFile(mcpJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, Record<string, unknown>> };
    const servers = parsed.mcpServers ?? {};
    return Object.entries(servers).map(([name, config]) => ({ name, config }));
  } catch {
    return [];
  }
}

export async function addMcpServer(name: string, json: string, cwd: string): Promise<void> {
  await execFileAsync("claude", ["mcp", "add-json", name, json, "--scope", "project"], { cwd });
}

export async function removeMcpServer(name: string, cwd: string): Promise<void> {
  await execFileAsync("claude", ["mcp", "remove", name, "--scope", "project"], { cwd });
}
