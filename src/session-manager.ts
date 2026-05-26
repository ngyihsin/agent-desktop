import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ToWebview, TranscriptMessage } from "./chat-webview";
import { type SpawnMode, spawnClaude } from "./claude-spawn";
import { type JsonlEvent, streamJsonl } from "./jsonl";
import type { ProjectStore, ProjectStoreEntry } from "./project-store";
import type { ToolUseInfo } from "./webview-protocol";

/** Minimal shape SessionManager needs from a webview. Keeps tests vscode-free. */
export interface ChatSender {
  send(msg: ToWebview): void;
}

/** Minimal shape for an `OutputChannel`-like logger. */
export interface Logger {
  append(value: string): void;
  appendLine(value: string): void;
}

/** Factory that produces a child process. Injected so tests can fake spawn. */
export type Spawner = (
  mode: SpawnMode,
  sessionId: string,
  cwd: string,
  additionalDirs?: readonly string[],
) => ChildProcess;

/**
 * Pick the spawn mode based on whether the session has been resumed at least
 * once. First turn ever → `fresh` (creates the session); every subsequent
 * turn → `resume`.
 */
export function pickMode(entry: ProjectStoreEntry): SpawnMode {
  return entry.lastResumeAt ? "resume" : "fresh";
}

interface UsageLike {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface ModelUsageLike {
  inputTokens: number;
  contextWindow: number;
}

interface ResultEventLike {
  total_cost_usd?: number;
  usage?: UsageLike;
  modelUsage?: Record<string, ModelUsageLike>;
}

/**
 * Compute context-window utilization for the *primary* conversation model.
 *
 * Returns 0..1. Falls back to 0 when the event lacks usage / modelUsage data.
 *
 * **Dominant-model heuristic:** match the top-level `usage.input_tokens`
 * against each `modelUsage[*].inputTokens`. The match is the primary turn's
 * model. This avoids confusing Claude Code's background-task model (e.g.
 * `claude-haiku-4-5` doing internal ops with high token counts) with the
 * user-facing conversation model (e.g. `claude-sonnet-4-6`). If no model
 * matches exactly, fall back to the largest `contextWindow` — conservative
 * (under-reports % → triggers `/compact` slightly later, never earlier).
 *
 * effective_context = input + cache_creation + cache_read (DESIGN Decision 10)
 */
export function computeContextPct(ev: ResultEventLike): number {
  if (!ev.usage || !ev.modelUsage) return 0;
  const dominant = pickDominantModel(ev.usage.input_tokens, ev.modelUsage);
  if (!dominant || dominant.contextWindow <= 0) return 0;
  const effective =
    ev.usage.input_tokens +
    ev.usage.cache_creation_input_tokens +
    ev.usage.cache_read_input_tokens;
  return Math.min(effective / dominant.contextWindow, 1);
}

function pickDominantModel(
  primaryInputTokens: number,
  mu: Record<string, ModelUsageLike>,
): ModelUsageLike | undefined {
  // Prefer the model whose inputTokens matches the primary turn's input.
  for (const m of Object.values(mu)) {
    if (m.inputTokens === primaryInputTokens) return m;
  }
  // Fallback: largest contextWindow (conservative under-report).
  let largest: ModelUsageLike | undefined;
  for (const m of Object.values(mu)) {
    if (!largest || m.contextWindow > largest.contextWindow) largest = m;
  }
  return largest;
}

/**
 * Owns one project's per-turn lifecycle.
 *
 * Per DESIGN Decision 4: one `claude` subprocess per turn. After each turn
 * we persist `lastResumeAt` so the next turn uses `--resume`. Auto-compact
 * (Decision 10) is **not** wired yet — Phase 3 Step 15.
 */
export class SessionManager {
  private transcript: TranscriptMessage[] = [];
  private activeChild: ChildProcess | null = null;

  constructor(
    private readonly folderPath: string,
    private readonly store: ProjectStore,
    private readonly chat: ChatSender,
    private readonly logger: Logger,
    private readonly spawner: Spawner = spawnClaude,
  ) {}

  getTranscript(): readonly TranscriptMessage[] {
    return this.transcript;
  }

  interrupt(): void {
    this.activeChild?.kill();
  }

  /** Run a single user → claude → reply turn end-to-end. */
  async prompt(text: string): Promise<void> {
    const entry = this.store.get(this.folderPath);
    if (!entry) {
      this.chat.send({
        kind: "error",
        message: `No project at ${this.folderPath}`,
      });
      return;
    }

    this.transcript.push({
      role: "user",
      text,
      timestamp: new Date().toISOString(),
    });

    const mode = pickMode(entry);
    const turnId = randomUUID();
    const child = this.spawner(mode, entry.sessionId, this.folderPath, entry.allowedDirs);

    if (!child.stdin || !child.stdout) {
      this.chat.send({
        kind: "error",
        message: "claude subprocess has no stdin/stdout",
      });
      return;
    }

    // Pipe stderr to the project's OutputChannel.
    child.stderr?.on("data", (chunk: unknown) => {
      const s =
        typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
      this.logger.append(s);
    });

    // Send the user prompt and close stdin so claude can finish the turn.
    child.stdin.write(text + "\n");
    child.stdin.end();

    this.chat.send({ kind: "turn_started", turnId });

    let assistantText = "";
    let contextPct = 0;
    let costUsd = 0;

    this.activeChild = child;
    try {
      for await (const ev of streamJsonl(child.stdout)) {
        this.logger.appendLine(JSON.stringify(ev));

        if (ev.type === "system" && ev.subtype === "init") {
          const init = ev as { slash_commands?: string[]; skills?: string[] };
          const commands = [...new Set([...(init.slash_commands ?? []), ...(init.skills ?? [])])];
          if (commands.length > 0) {
            this.chat.send({ kind: "commands_available", commands });
          }
          continue;
        }

        if (ev.type === "system" && ev.subtype === "status") {
          this.chat.send({
            kind: "status_update",
            status: (ev.status as string | null) ?? null,
          });
          continue;
        }

        const delta = extractTextDelta(ev);
        if (delta) {
          assistantText += delta;
          this.chat.send({ kind: "text_delta", turnId, text: delta });
          continue;
        }
        if (ev.type === "assistant") {
          const tools = extractToolUses(ev);
          if (tools.length > 0) {
            this.chat.send({ kind: "tool_uses", tools });
          }
          continue;
        }
        if (ev.type === "result") {
          const r = ev as unknown as ResultEventLike;
          contextPct = computeContextPct(r);
          costUsd = r.total_cost_usd ?? 0;
        }
      }
    } catch (err) {
      this.chat.send({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.activeChild = null;
    }

    await new Promise<void>((resolve) => {
      if (child.exitCode != null) return resolve();
      child.on("exit", () => resolve());
    });

    this.transcript.push({
      role: "assistant",
      text: assistantText,
      turnId,
      cost_usd: costUsd,
      timestamp: new Date().toISOString(),
    });

    await this.store.update(this.folderPath, {
      lastResumeAt: new Date().toISOString(),
    });

    this.chat.send({
      kind: "turn_complete",
      turnId,
      cost_usd: costUsd,
      context_pct: contextPct,
    });

    // If Claude reported that it cannot access a path outside the session
    // directory, surface a "Grant Access" button in the webview so the user
    // can pick a folder and restart the session with --add-dir.
    if (isBlockedAccessResponse(assistantText)) {
      this.chat.send({ kind: "grant_access_prompt" });
    }
  }
}

/**
 * Heuristic: does the assistant response indicate Claude Code blocked a
 * file-system access request due to session directory restrictions?
 */
function isBlockedAccessResponse(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("session is locked") ||
    t.includes("file access is restricted") ||
    t.includes("cannot access any path outside") ||
    (t.includes("don't have permission") && t.includes("access")) ||
    (t.includes("blocked") && t.includes("locked"))
  );
}

/** Extract tool_use blocks from a completed `assistant` event. */
function extractToolUses(ev: JsonlEvent): ToolUseInfo[] {
  const msg = (ev as { message?: { content?: unknown[] } }).message;
  if (!Array.isArray(msg?.content)) return [];
  const tools: ToolUseInfo[] = [];
  for (const block of msg.content) {
    const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
    if (b.type === "tool_use" && typeof b.name === "string") {
      tools.push({ name: b.name, input: b.input ?? {} });
    }
  }
  return tools;
}

/**
 * Pull `text` out of a `stream_event` carrying a `content_block_delta` of
 * type `text_delta`. Returns `null` for any other event shape.
 */
function extractTextDelta(ev: JsonlEvent): string | null {
  if (ev.type !== "stream_event") return null;
  const inner = (ev as { event?: unknown }).event as
    | { type?: string; delta?: { type?: string; text?: string } }
    | undefined;
  if (inner?.type !== "content_block_delta") return null;
  if (inner.delta?.type !== "text_delta") return null;
  return typeof inner.delta.text === "string" ? inner.delta.text : null;
}
