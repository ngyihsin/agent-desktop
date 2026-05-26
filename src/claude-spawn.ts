import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

/**
 * Whether this spawn is starting a brand-new session or continuing one.
 * - `fresh`  → claude gets `--session-id <uuid>` (creates the session)
 * - `resume` → claude gets `--resume <uuid>` (continues an existing one)
 *
 * Per DESIGN Decision 4: one process per turn. Multi-turn = repeated
 * invocations with `--resume`.
 */
export type SpawnMode = "fresh" | "resume";

export type ClaudeSpawnConfig = {
  readonly command: string;
  readonly freshArgs: readonly string[];
  readonly resumeArgsTemplate: readonly string[]; // contains "{sessionId}" placeholder
  readonly spawnOptions: (cwd: string) => SpawnOptions;
};

/**
 * Declarative spawn shape per DESIGN Decision 2.
 *
 * Source: openclaw's `extensions/anthropic/cli-backend.ts:32-55`, minus
 * `--allowedTools mcp__openclaw__*` (we keep claude's full built-in tool
 * surface — see DESIGN Decision 2 and Open Question #9 / Decision 14 for the
 * deferred allowlist toggle).
 *
 * Stdio shape per Decision 3: capture all three streams so stderr lands in
 * the per-project OutputChannel rather than leaking to the integrated
 * terminal.
 */
export const CLAUDE_SPAWN_CONFIG: ClaudeSpawnConfig = {
  command: "claude",
  freshArgs: [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--setting-sources", "user",
  ],
  resumeArgsTemplate: [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--setting-sources", "user",
    "--resume", "{sessionId}",
  ],
  spawnOptions: (cwd) => ({
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    windowsHide: true,
  }),
};

/**
 * Assemble the argv for a single claude invocation.
 *
 * Fresh:  freshArgs ++ ["--session-id", <uuid>]
 * Resume: resumeArgsTemplate with "{sessionId}" substituted
 *
 * `additionalDirs` maps to one `--add-dir <path>` pair per entry, appended
 * at the end. This extends claude's file-access scope beyond the project cwd
 * (DESIGN Decision 2 evolution — `--add-dir` flag discovery).
 *
 * Kept as pure data manipulation so it can be unit-tested without spawning
 * any process (see test/unit/claude-spawn.test.ts).
 */
export function buildArgs(
  mode: SpawnMode,
  sessionId: string,
  additionalDirs: readonly string[] = [],
): string[] {
  const base =
    mode === "fresh"
      ? [...CLAUDE_SPAWN_CONFIG.freshArgs, "--session-id", sessionId]
      : CLAUDE_SPAWN_CONFIG.resumeArgsTemplate.map((a) => a.replace("{sessionId}", sessionId));

  const dirArgs = additionalDirs.flatMap((d) => ["--add-dir", d]);
  return [...base, ...dirArgs];
}

/**
 * Spawn a claude child process. Returns the `ChildProcess` so the caller
 * (SessionManager) can wire up stdin / stdout / stderr / exit.
 */
export function spawnClaude(
  mode: SpawnMode,
  sessionId: string,
  cwd: string,
  additionalDirs: readonly string[] = [],
): ChildProcess {
  return spawn(
    CLAUDE_SPAWN_CONFIG.command,
    buildArgs(mode, sessionId, additionalDirs),
    CLAUDE_SPAWN_CONFIG.spawnOptions(cwd),
  );
}
