# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agent Desktop is a **VS Code extension** that hosts multiple doc-authoring Claude Code projects in parallel. Each project is a folder scaffolded from [`codeatlas`](https://github.com/ngyihsin/codeatlas), backed by one long-lived `claude` CLI session, whose `.md` files are both the agent's working notes and the finished technical document. The extension itself ships no external connectors — all external context (Jira, GitHub, Confluence, etc.) comes from Claude Code's MCP servers and skills, which the extension only surfaces and configures.

The extension **drives the `claude` CLI as a subprocess**; it does not call the Anthropic API directly. `claude` must be on `PATH` (checked at activation via `src/activation-check.ts`).

## Commands

```bash
npm run build          # Bundle extension + webview with esbuild → out/extension.js + out/webview.js
npm run watch          # Same, in watch mode (used by the F5 "Run Extension" launch config)
npm run test:unit      # Run all vitest unit tests (test/unit/**/*.test.ts)
npm run test:unit:watch
npx tsc --noEmit       # Typecheck only — esbuild does NOT type-check, so run this separately
```

Run a single test file or test by name:

```bash
npx vitest run test/unit/claude-spawn.test.ts
npx vitest run -t "fresh: appends --session-id"
```

There is no linter configured. `tsconfig.json` is strict (`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`); typechecking is the effective lint gate. To exercise the extension end-to-end, open the folder in VS Code and press F5 ("Run Extension" — it runs the `build` task then launches an Extension Development Host).

## Two builds, two runtimes

`esbuild.config.mjs` produces two separate bundles from two entry points — keep their constraints straight:

- **Extension host** (`src/extension.ts` → `out/extension.js`): Node/CJS, `external: ["vscode"]`. Compiled by `tsconfig.json` (`rootDir: src`, excludes `test` and `extension/webview`).
- **Webview** (`src/webview-main.ts` → `out/webview.js`): browser/IIFE, **no `vscode` module**. Runs inside the chat `WebviewPanel`.

The two sides communicate only through the message types in `src/webview-protocol.ts` (`ToWebview` / `FromWebview`). That file is deliberately dependency-free so both sides can import it — do not import `vscode` into it, and route all host↔webview traffic through those discriminated unions.

## Architecture (the parts that span files)

**Per-turn subprocess model.** Claude Code is invoked once per conversation turn, not kept running. `src/claude-spawn.ts` builds the argv: the first turn of a session spawns `fresh` (`--session-id <uuid>`), every later turn spawns `resume` (`--resume <uuid>`). Mode is chosen by `pickMode()` in `session-manager.ts` from whether `lastResumeAt` is set. Standard flags: `-p --output-format stream-json --include-partial-messages --verbose --setting-sources user`. Built-in tools are intentionally **not** restricted (no `--allowedTools`).

**Session lifecycle.** `src/session-manager.ts` (`SessionManager`, one instance per open project) owns a turn: writes the prompt to the child's stdin, streams JSONL from stdout via `src/jsonl.ts` (`streamJsonl` — buffered line splitter that tolerates chunk-split and malformed lines), translates events into `ToWebview` messages, accumulates the assistant transcript in memory, and persists `lastResumeAt`. stderr is piped to a per-project `OutputChannel` for debugging.

**Auto-compact.** After each turn, `computeContextPct()` estimates context-window utilization for the *dominant* conversation model (matches top-level `usage.input_tokens` against `modelUsage[*].inputTokens` to avoid counting Claude Code's background/haiku model; falls back to the largest `contextWindow`). At `COMPACT_THRESHOLD = 0.75` it spawns a `resume` turn that sends `/compact`.

**One shared webview across all projects.** `src/shared-chat-panel.ts` (`SharedChatPanel`) is a single `WebviewPanel`, not one panel per project. Clicking a project in the sidebar calls `switchToProject`, which retitles the panel and replays that project's transcript. Every project's `SessionManager` keeps running in the background; `senderFor(folderPath)` returns a `ChatSender` that **drops events unless that project is currently active** — background turns are not lost because their completed messages live in the transcript and replay on the next switch.

**Persistence.** `src/project-store.ts` (`ProjectStore`) stores all projects under a single `globalState` (Memento) key as `{ [folderPath]: entry }`, keyed by absolute folder path. This survives VS Code restarts; the stable `sessionId` is what lets `--resume` reconnect. In-memory runtime state (`SessionManager`, `OutputChannel`) is rebuilt on the next open and transcripts replay from memory only within a session lifetime.

**New project flow.** `src/commands/new-project.ts` copies `extension/resources/scaffolds/codeatlas/` (via `src/scaffold.ts`) into an empty target folder, registers a `ProjectStore` entry with a fresh `sessionId`, then opens it. The first turn auto-sends `FRESH_PROJECT_SEED` (`src/commands/open-chat.ts`) so Claude bootstraps from `AGENT-warm-up.md` without user input. `src/workspace-manager.ts` also maintains a multi-root `.code-workspace` file listing all known projects.

**Directory access.** Claude Code locks file-access paths at session creation, so `--add-dir` only takes effect on a `fresh` spawn. Granting a new directory (`addDirectory` command, or the "Grant Access" button triggered when `isBlockedAccessResponse()` matches an assistant reply) therefore **rotates `sessionId` and clears `lastResumeAt`** to force a new session — this discards the current conversation, and the code warns the user before doing so.

**MCP configuration.** `src/mcp.ts` reads a project's active servers from its `.mcp.json` and adds/removes them by shelling out to `claude mcp add-json|remove --scope project`. The extension never implements OAuth or content parsing itself.

**Auth.** An Anthropic API key can be stored via the `setApiKey` command in VS Code `SecretStorage` (never settings.json) and is injected as `ANTHROPIC_API_KEY` into the child env; `agentDesktop.anthropic.baseUrl` maps to `ANTHROPIC_BASE_URL`. With no key set, the child falls back to Claude Code's own auth.

## Conventions

- **Keep logic modules `vscode`-free so they stay unit-testable.** Files under `src/` that hold real logic (`project-store.ts`, `session-manager.ts`, `claude-spawn.ts`, `jsonl.ts`, `paths.ts`, `mcp.ts`, `scaffold.ts`, `workspace-manager.ts`, `webview-protocol.ts`) do not import `vscode`. They depend on minimal structural interfaces (`MementoLike`, `ChatSender`, `Logger`, `Spawner`) that are faked in tests. `vscode` usage is concentrated in `extension.ts`, `shared-chat-panel.ts`, `chat-*`, and `src/commands/*`. Preserve this seam when adding code.
- **Command IDs are namespaced `agentDesktop.*`** and declared in `package.json` under `contributes.commands`; register them in `extension.ts`. All commands run behind `requireClaude()`, which no-ops with a prompt if the `claude` CLI isn't ready.
- Design decisions are referenced in code comments as "DESIGN Decision N" — the rationale lives in `DESIGN.md`.

## Repo layout note: this repo is *itself* a codeatlas project

The root-level `.md` files (`SPEC.md`, `DESIGN.md`, `IMPLEMENTATION-GUIDE.md`, `HANDOFF.md`, `TESTING-GUIDE.md`, `INIT-GUIDE.md`, `AGENT-warm-up.md`, `template/`, `logs/`) are the **doc-driven development process for building the extension**, not shipped artifacts (`.vscodeignore` excludes them from the package). Do not confuse them with `extension/resources/scaffolds/codeatlas/`, which is the scaffold *copied into new user projects*.

The process is spec/doc-driven: `SPEC.md` (requirements) → `DESIGN.md` (architecture + numbered decisions) → `IMPLEMENTATION-GUIDE.md` (step-by-step plan) → `HANDOFF.md` (live status, next actions, session history). When you change behavior that a doc describes, update the doc. `HANDOFF.md` is the source of truth for current status and is meant to be a complete handoff package; keep it current and add a session log under `logs/` (see `logs/SESSION-LOG-TEMPLATE.md`) at the end of substantial work.

> Note: `README.md` still describes the project as "Phase 1 — Spec, no code written yet." That header is stale — the extension is implemented. Trust the source and `HANDOFF.md` over the README's phase labels.
