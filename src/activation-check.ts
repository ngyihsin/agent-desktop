import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Result of probing whether the `claude` CLI is reachable.
 * Discriminated by the `available` boolean.
 */
export type ClaudeAvailability =
  | { available: true; version: string }
  | { available: false; reason: string };

/**
 * Run `claude --version` and report whether the binary is on PATH and responds.
 *
 * Per DESIGN Decision 8: this gates command registration so the user gets a
 * clear "install Claude Code" prompt instead of a cryptic spawn failure on
 * first prompt.
 */
export async function checkClaudeAvailable(): Promise<ClaudeAvailability> {
  try {
    const out = await execAsync("claude --version", { timeout: 10_000 });
    const version = out.stdout.trim();
    if (!version) {
      return { available: false, reason: "`claude --version` produced no output" };
    }
    return { available: true, version };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { available: false, reason };
  }
}
