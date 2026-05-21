# Implementation Guide: Agent Desktop

**Project:** Agent Desktop
**Created:** 2026-05-15
**Last Updated:** 2026-05-15
**Status:** Phase 2 — drafting; coding has not started

---

## Navigation

**Project Docs:** [README](README.md) | [SPEC](SPEC.md) | [DESIGN](DESIGN.md) | [IMPLEMENTATION-GUIDE](IMPLEMENTATION-GUIDE.md) *(you are here)* | [HANDOFF](HANDOFF.md)

**This Document:**
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [File Structure](#file-structure)
- [Implementation Details](#implementation-details)
- [Implementation Phases](#implementation-phases)
- [Resolving Remaining SPEC Questions](#resolving-remaining-spec-questions)
- [Build & Test](#build--test)

---

## Overview

### What We're Building

A VS Code extension that hosts N parallel doc-authoring projects, each pairing a webview chat panel with a persistent `claude` Code session running in the project's workspace folder. The extension owns process lifecycle, sidebar UI, multi-root workspace registration, and context-window monitoring. Claude does the agent work.

### Key Principle

**End-to-end first, then layer.** Phase 1 ships a single-project prototype that proves the full happy path: extension activates → user runs "New Project" → folder is cloned from the bundled `codeatlas` snapshot → Claude session starts → user types in the webview → JSONL streams back → assistant text renders. Multi-project, auto-compact, MCP config UI, folder-delete watcher all come **after** this thin slice works.

Why: every architectural risk lives in the thin slice. Streaming JSONL into a webview, managing a child process lifecycle, registering a workspace root — if any of those don't work, building the sidebar is wasted effort.

---

## Prerequisites

### Dependencies

- **Node.js 20 LTS or newer** — VS Code's extension host runs Node ≥20 on current stable channels.
- **VS Code 1.85.0+** — for stable WebviewView, TreeDataProvider, and `globalState` APIs.
- **`claude` CLI on PATH (v2.1.142 verified)** — installed and authenticated. Confirm with `claude --version`.
- **`git`** — for cloning the repo locally during dev.
- **`@vscode/vsce`** — optional, only needed for `.vsix` packaging at end of phase 4.

### Build Environment

```bash
# Create the extension repo
mkdir agent-desktop && cd agent-desktop
npm init -y
npm install --save-dev typescript@5 esbuild@0 @types/node@20 @types/vscode@1.85
npm install --save-dev @vscode/test-electron vitest
# Runtime deps deliberately minimal — no @agentclientprotocol/sdk (Decision 5)
```

### One-time setup

```bash
# Snapshot codeatlas into the extension resources directory (Decision 7)
mkdir -p extension/resources/scaffolds/codeatlas
git clone --depth 1 https://github.com/ngyihsin/codeatlas /tmp/codeatlas-snap
cp -r /tmp/codeatlas-snap/template/. extension/resources/scaffolds/codeatlas/
# Record the upstream commit hash
(cd /tmp/codeatlas-snap && git rev-parse HEAD) > extension/resources/scaffolds/codeatlas/.upstream-commit
rm -rf /tmp/codeatlas-snap
```

The upstream commit hash gets documented in `README.md` so future scaffold refreshes are traceable.

---

## File Structure

```
agent-desktop/
├── package.json                       # vsce manifest + npm scripts
├── tsconfig.json
├── esbuild.config.mjs
├── README.md
├── .vscodeignore
├── extension/
│   ├── resources/
│   │   └── scaffolds/
│   │       └── codeatlas/              # bundled snapshot (Decision 7)
│   │           ├── AGENT-warm-up.md
│   │           ├── ONBOARD-GUIDE.md
│   │           ├── CLAUDE.md
│   │           ├── HANDOFF.md
│   │           ├── ... (full template/ contents)
│   │           └── .upstream-commit
│   └── webview/
│       ├── index.html                  # static shell
│       ├── main.ts                     # webview-side script
│       └── style.css
├── src/
│   ├── extension.ts                    # activation entry point
│   ├── jsonl.ts                        # 30-line NDJSON splitter (Decision 5)
│   ├── claude-spawn.ts                 # spawn config + lifecycle (Decisions 2, 3, 4)
│   ├── session-manager.ts              # per-project turn state + auto-compact (Decisions 6, 10)
│   ├── project-registry.ts             # in-memory open-project map
│   ├── project-store.ts                # globalState wrapper (Decision 6)
│   ├── workspace-manager.ts            # multi-root .code-workspace generator
│   ├── projects-view.ts                # TreeDataProvider for activity-bar sidebar
│   ├── chat-webview.ts                 # webview controller (per project)
│   ├── activation-check.ts             # `claude --version` (Decision 8)
│   ├── filesystem-watcher.ts           # folder-delete handler (Decision 12)
│   ├── mcp/
│   │   ├── types.ts                    # AgentDesktopMcpServer interface (Decision 13)
│   │   ├── config-surface.ts           # shells out to `claude mcp` (Decision 9)
│   │   └── stub-server.ts              # empty MCP server (Decision 13)
│   └── commands/
│       ├── new-project.ts
│       ├── open-project.ts
│       └── interrupt.ts
└── test/
    ├── unit/
    │   ├── jsonl.test.ts
    │   └── claude-spawn.test.ts
    └── integration/
        └── new-project-e2e.test.ts
```

---

## Implementation Details

### JSONL parser (`src/jsonl.ts`) — owned, ~30 lines (Decision 5)

```ts
import { Readable } from "node:stream";

export type JsonlEvent = Record<string, unknown> & { type: string; subtype?: string };

export async function* streamJsonl(stdout: Readable): AsyncIterable<JsonlEvent> {
  let buf = "";
  for await (const chunk of stdout) {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          yield JSON.parse(line) as JsonlEvent;
        } catch {
          // skip — malformed lines are non-fatal (logged via OutputChannel by caller)
        }
      }
      nl = buf.indexOf("\n");
    }
  }
  const trailing = buf.trim();
  if (trailing) {
    try { yield JSON.parse(trailing) as JsonlEvent; } catch { /* skip */ }
  }
}
```

**Key points:**
- Uses an async generator so consumers can `for await` lines as they arrive — naturally back-pressured.
- Holds an incomplete-line buffer (`buf`) for chunk boundaries that split a JSON object.
- Malformed lines are silently dropped; the caller logs them via `OutputChannel` if it cares.
- No dependency on `@agentclientprotocol/sdk` or `ndjson`.

### Spawn config (`src/claude-spawn.ts`) — declarative, single constant (Decisions 2, 3, 4)

```ts
import { spawn, type SpawnOptions } from "node:child_process";

export type SpawnMode = "fresh" | "resume";

export type ClaudeSpawnConfig = {
  command: string;
  freshArgs: string[];
  resumeArgsTemplate: string[];          // {sessionId} placeholder
  spawnOptions: (cwd: string) => SpawnOptions;
};

export const CLAUDE_SPAWN_CONFIG: ClaudeSpawnConfig = {
  command: "claude",
  freshArgs: [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--setting-sources", "user",
    // --session-id is appended at runtime so the caller controls the uuid
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
    stdio: ["pipe", "pipe", "pipe"],     // Decision 3
    env: process.env,
    windowsHide: true,
  }),
};

export function buildArgs(mode: SpawnMode, sessionId: string): string[] {
  if (mode === "fresh") return [...CLAUDE_SPAWN_CONFIG.freshArgs, "--session-id", sessionId];
  return CLAUDE_SPAWN_CONFIG.resumeArgsTemplate.map((a) => a.replace("{sessionId}", sessionId));
}

export function spawnClaude(mode: SpawnMode, sessionId: string, cwd: string) {
  return spawn(
    CLAUDE_SPAWN_CONFIG.command,
    buildArgs(mode, sessionId),
    CLAUDE_SPAWN_CONFIG.spawnOptions(cwd),
  );
}
```

**Key points:**
- Argv is data (`CLAUDE_SPAWN_CONFIG`), spawn is logic (`spawnClaude`). Easy to test argv-building in isolation.
- `--session-id` for fresh, `--resume` for continuing — same `<uuid>` value either way.
- `cwd` = project folder (passed in by `SessionManager`).
- `stdio: ["pipe", "pipe", "pipe"]` per Decision 3 — stderr captured into a dedicated OutputChannel.

### Session manager (`src/session-manager.ts`) — per-turn state machine

```ts
// Sketch — full impl ~150 lines

export class SessionManager {
  constructor(
    private folderPath: string,
    private store: ProjectStore,
    private outputChannel: vscode.OutputChannel,
    private webview: ChatWebview,
  ) {}

  async prompt(text: string): Promise<void> {
    const entry = this.store.get(this.folderPath);
    const mode: SpawnMode = entry.lastResumeAt ? "resume" : "fresh";
    const turnId = randomUUID();

    const child = spawnClaude(mode, entry.sessionId, this.folderPath);
    this.webview.send({ kind: "turn_started", turnId });

    // Stream stderr to OutputChannel
    child.stderr.on("data", (b) => this.outputChannel.append(b.toString("utf8")));

    // Send user message
    child.stdin.write(text + "\n");
    child.stdin.end();

    // Consume JSONL
    let contextPct = 0;
    let cost = 0;
    for await (const ev of streamJsonl(child.stdout)) {
      this.outputChannel.appendLine(JSON.stringify(ev));   // archival log
      this.dispatchEvent(ev, turnId, (pct, c) => { contextPct = pct; cost = c; });
    }

    await new Promise<void>((res) => child.on("exit", () => res()));

    this.store.update(this.folderPath, { lastResumeAt: new Date().toISOString() });
    this.webview.send({ kind: "turn_complete", turnId, cost_usd: cost, context_pct: contextPct });

    if (contextPct > 0.75) {
      await this.compact();
    }
  }

  private dispatchEvent(ev: JsonlEvent, turnId: string,
                       update: (pct: number, cost: number) => void): void {
    if (ev.type === "stream_event") {
      const stream = (ev as any).event;
      if (stream.type === "content_block_delta" && stream.delta?.type === "text_delta") {
        this.webview.send({ kind: "text_delta", turnId, text: stream.delta.text });
      }
    } else if (ev.type === "result") {
      const r = ev as any;
      const dom = this.dominantModel(r.modelUsage);
      const ctx = (r.usage.input_tokens + r.usage.cache_creation_input_tokens
                 + r.usage.cache_read_input_tokens) / dom.contextWindow;
      update(ctx, r.total_cost_usd);
    } else if (ev.type === "system" && ev.subtype === "compact_boundary") {
      this.webview.send({ kind: "compact_done", new_context_pct: 0 /* recomputed next turn */ });
    }
  }

  private dominantModel(mu: Record<string, ModelUsage>): ModelUsage {
    return Object.values(mu).reduce((a, b) => a.inputTokens > b.inputTokens ? a : b);
  }

  private async compact(): Promise<void> {
    this.webview.send({ kind: "compact_started" });
    const entry = this.store.get(this.folderPath);
    const child = spawnClaude("resume", entry.sessionId, this.folderPath);
    child.stdin.write("/compact\n");
    child.stdin.end();
    for await (const _ev of streamJsonl(child.stdout)) { /* drain */ }
    await new Promise<void>((res) => child.on("exit", () => res()));
  }
}
```

**Key points:**
- One `prompt()` call = one child process. Lifecycle is bounded by `child.on("exit")`.
- Auto-compact (Decision 10) fires *after* a normal turn completes — separate spawn with `/compact` on stdin.
- All raw JSONL goes into an OutputChannel for debugging; only typed events go to the webview.

### Activation check (`src/activation-check.ts`) — Decision 8

```ts
export async function checkClaudeAvailable(): Promise<{ ok: true; version: string } | { ok: false; reason: string }> {
  try {
    const out = await execAsync("claude --version");
    return { ok: true, version: out.stdout.trim() };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
```

In `extension.ts`'s `activate()`, call this once; if it fails, show a notification with a "Get Claude Code" button (links to the official install URL) and **register commands as no-ops** so the user gets a clear error instead of a cryptic spawn failure.

### Webview ↔ extension-host messaging (`src/chat-webview.ts` + `extension/webview/main.ts`)

The extension host owns the source-of-truth transcript and computes streaming. The webview just renders. Messages match the typed protocol in `DESIGN.md` → Data Model.

Webview-side (`extension/webview/main.ts`):
```ts
const vscode = acquireVsCodeApi();
const out = document.getElementById("transcript")!;
const input = document.getElementById("input") as HTMLTextAreaElement;

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg.kind === "text_delta") out.append(msg.text);            // append-only, streaming
  if (msg.kind === "turn_complete") /* render cost/context badge */;
  if (msg.kind === "transcript_replay") /* render full transcript on first paint */;
});

document.getElementById("submit")!.addEventListener("click", () => {
  vscode.postMessage({ kind: "submit_prompt", text: input.value });
  input.value = "";
});
```

For markdown rendering (resolves SPEC Q7 — see below), keep the live stream as plain `<pre>` text-deltas; on `turn_complete`, replace the last assistant block with a markdown-rendered version. This avoids re-parsing partial markdown on every chunk.

### `claude mcp` integration (`src/mcp/config-surface.ts`) — Decision 9

```ts
export async function listMcps(cwd: string): Promise<McpServerEntry[]> {
  const { stdout } = await execAsync("claude mcp list", { cwd });
  return parseMcpListOutput(stdout);
}

export async function addMcp(cwd: string, name: string, json: object): Promise<void> {
  await execAsync(`claude mcp add-json ${shellQuote(name)} ${shellQuote(JSON.stringify(json))}`, { cwd });
}

export async function removeMcp(cwd: string, name: string): Promise<void> {
  await execAsync(`claude mcp remove ${shellQuote(name)}`, { cwd });
}
```

`parseMcpListOutput` is text-parsing today (claude doesn't seem to emit JSON for `mcp list` — verify during implementation). If the format is unstable, fall back to direct `.mcp.json` reads.

---

## Implementation Phases

### Phase 1: Single-project happy path

**Goal:** From extension activation, the user can run "New Project: Codeatlas", enter a prompt in the chat webview, and see Claude's streamed reply. Persistence works (close VS Code, reopen, resume continues).

**Status:** NOT STARTED.

Steps:

1. **npm scaffold + tsconfig + esbuild** — Standard VS Code extension setup. `package.json` declares one command (`agentDesktop.newProject`) and one viewsContainer/view (the sidebar, empty for now).
2. **`activation-check.ts`** — Run `claude --version` on activate. On failure, gate command registration.
3. **`jsonl.ts`** — Implement the 30-line parser. Unit test against the raw JSONL captured in spike 1 (saved in `test/unit/fixtures/spike1.jsonl`).
4. **`claude-spawn.ts`** — Implement spawn config + `buildArgs` + `spawnClaude`. Unit test argv assembly.
5. **`project-store.ts`** — Wrapper around `vscode.ExtensionContext.globalState`. Get/set/list `ProjectStoreEntry`.
6. **`commands/new-project.ts`** — Ask for project name; create folder at `~/agent-desktop-projects/<name>/`; copy `extension/resources/scaffolds/codeatlas/` into it; generate a fresh `sessionId` (uuid v4); store the entry; open the folder as a workspace root.
7. **`chat-webview.ts` + `extension/webview/`** — Register a `WebviewView` provider for a single global "active project" panel (multi-panel comes in Phase 2). Wire `postMessage` both ways.
8. **`session-manager.ts`** — Implement `prompt()` end-to-end. Hook up to the webview's `submit_prompt`. **Don't** implement auto-compact yet — that's Phase 3.
9. **Seed message** — On project creation, programmatically send the first prompt: *"Read AGENT-warm-up.md and follow its bootstrap protocol."* (codeatlas's protocol takes over from there.)
10. **Resume on activation** — On `activate`, list `globalState` projects; if any are present, surface them in a simple "Recent Projects" QuickPick (full sidebar comes in Phase 2). Selecting one reopens its workspace folder and starts a `resume` session on next prompt.

**Validation:**
- Run extension in `Extension Development Host` (F5).
- Run **"Agent Desktop: New Project"** → enter "test-1" → folder created at `~/agent-desktop-projects/test-1/`, codeatlas .md files present, webview opens.
- First prompt visible in webview is the seed; Claude's response streams in.
- Close VS Code, reopen, run **"Agent Desktop: Recent Projects" → test-1** → webview rehydrates transcript; new prompt resumes the same `session_id`.
- Cost-per-turn matches spike expectations (~$0.006 on resume).

### Phase 2: Multi-project + sidebar

**Goal:** Multiple projects open simultaneously, each with its own chat webview; project list lives in a real activity-bar sidebar; multi-root workspace integration.

Steps:
11. **`projects-view.ts`** — Implement `TreeDataProvider`; refresh on `ProjectRegistry` changes; click handlers set active project.
12. **`workspace-manager.ts`** — Generate `~/agent-desktop-projects/agent-desktop.code-workspace`; update on add/remove.
13. **Per-project webview** — Replace the single global webview with one webview per project; route messages by project id.
14. **`commands/open-project.ts`** — Picker dialog to open an existing folder as a project (must contain `AGENT-warm-up.md`); register session if not already stored.

**Validation:** Two projects open in one window; switching between them in the sidebar swaps the webview without state leakage; both sessions stay alive across switches.

### Phase 3: Auto-compact, folder-delete, MCP config

**Goal:** Long-running sessions survive the context-window ceiling; deleted folders don't ghost in the sidebar; user can manage per-project MCP servers.

Steps:
15. **Auto-compact in `session-manager.ts`** — Implement `compact()`; trigger when `contextPct > 0.75` after a turn (Decision 10).
16. **`filesystem-watcher.ts`** — Per-project `createFileSystemWatcher`; on delete, kill child, remove from registry (Decision 12).
17. **`mcp/config-surface.ts`** — Implement `list/add/remove` via `claude mcp` subcommands.
18. **MCP UI** — Settings panel within the project webview, listing active MCPs with add/remove buttons (resolves SPEC Q3 — see below).

**Validation:** Manual: feed a long transcript until usage > 75%, observe `/compact` toast and `system.compact_boundary` event in OutputChannel. Delete a project folder externally → sidebar entry disappears with toast. Add an Atlassian MCP via UI → `claude mcp list` reflects it.

### Phase 4: Polish + packaging

Steps:
19. Tool-allowlist setting (Decision 14) wired into `buildArgs`.
20. `agentDesktop.budget.perTurnUsd` setting → `--max-budget-usd` argv.
21. Error toast UX for `--resume` failure (SPEC Q6 — see below).
22. `vsce package` → install locally; smoke-test all success criteria from SPEC.

---

## Resolving Remaining SPEC Questions

### SPEC Q3 — MCP/skill config UX

**Resolution:** Settings panel inside the project webview, rendered as a collapsible section above the transcript. Reads active MCPs via `claude mcp list`, allows add (open a small form: name + command + args + env) and remove. Skills are listed read-only (claude's user-scope concern; per-project skill enablement is future work — defer until Q8 is taken up).

Implementation lands in Phase 3 (Step 18). The panel's data layer is `src/mcp/config-surface.ts`.

### SPEC Q6 — `--resume` failure mode

**Resolution:** When `spawnClaude("resume", ...)` results in a non-zero exit before any `result` event is produced, treat it as a resume failure. Behavior:

1. Capture stderr to detect "session not found" patterns (specific error format TBD by inspection during Phase 4).
2. Show a modal: *"Couldn't resume session for project '<name>' — the session may have been cleaned up. Start a fresh session? (your local .md files are unchanged)"* with **Start Fresh** / **Cancel** buttons.
3. On **Start Fresh**: generate a new `sessionId`, write it to the store, switch the project's `lastResumeAt` to null, prompt the user that they're now in a fresh session.
4. On **Cancel**: leave project in a "session-missing" state; greyed-out chat input until the user either retries or starts fresh.

Implementation lands in Phase 4 (Step 21).

### SPEC Q7 — Webview chat ergonomics

**Resolution for v1:**

| Capability | v1 | Defer |
|---|---|---|
| Live text streaming | ✓ (`<pre>` text-delta) | — |
| Markdown rendering on turn-complete | ✓ (use [`marked`](https://github.com/markedjs/marked) ≤2KB gzipped) | — |
| Syntax-highlighted code blocks | ✓ (use [`highlight.js`](https://github.com/highlightjs/highlight.js)) | — |
| Slash-command surfacing (autocomplete /compact, /clear, etc.) | text-only — type slash commands in input | UI affordance → v2 |
| Image paste | — | v2 |
| Voice input | — | out of scope |
| Inline citations / source-link badges | — | v2 |

Rationale: markdown + code-block rendering is table stakes for a doc-authoring tool; everything else can layer on without changing the underlying message protocol.

Implementation: Phase 2 (Step 13) introduces the per-project webview HTML; `marked` + `highlight.js` are added there.

### SPEC Q8 — MCP discovery / onboarding

**Resolution:** **Out of scope for v1.** The user is expected to know which MCPs they want and add them manually via the Phase 3 UI. A future "Recommended MCPs for codeatlas" list (Atlassian, GitHub) can be a Phase 5 enhancement once we have telemetry on which integrations users actually adopt.

---

## Build & Test

### Building

```bash
npm install
npm run build        # esbuild bundles src/extension.ts → out/extension.js
npm run build:webview # bundle extension/webview/main.ts → out/webview/main.js
```

### Running (dev loop)

```bash
npm run watch        # esbuild --watch
# In VS Code: F5 to launch Extension Development Host
```

### Unit tests

```bash
npm run test:unit    # vitest src/**/*.test.ts
```

Required fixtures: `test/unit/fixtures/spike1.jsonl`, `test/unit/fixtures/spike2a.jsonl`, `test/unit/fixtures/spike2b.jsonl` — copy from `/tmp/agent-desktop-spikes/` during initial setup.

### Integration tests

```bash
npm run test:e2e     # @vscode/test-electron drives a real Extension Development Host
```

The integration suite must hit a real `claude` binary (no mocks — SPEC Goal #1 is "the extension drives claude"). CI either runs against a `claude` install with a low-budget account, or skips e2e on PRs and runs nightly on the maintainer's machine.

### Quick validation (full happy path)

```bash
npm run build && code --extensionDevelopmentPath=.
# In the launched window: cmd-shift-P → "Agent Desktop: New Project" → "test-1"
# Verify: folder created, webview opens, seed prompt fires, first response streams in.
```

### Packaging (Phase 4 only)

```bash
npm install -g @vscode/vsce
vsce package          # produces agent-desktop-0.1.0.vsix
code --install-extension agent-desktop-0.1.0.vsix
```

---

**Last Updated:** 2026-05-15
