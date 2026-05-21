# Handoff: Agent Desktop

**Project:** Agent Desktop
**Started:** 2026-05-14

---

## Navigation

**Project Docs:** [README](README.md) | [SPEC](SPEC.md) | [DESIGN](DESIGN.md) | [IMPLEMENTATION-GUIDE](IMPLEMENTATION-GUIDE.md) | [HANDOFF](HANDOFF.md) *(you are here)*

**Quick Jump:** [Current Status](#current-status) | [Next Actions](#next-actions) | [Session Logs](#session-logs)

---

## Current Status

**Phase:** Phase 3 — Prototype (**Phase 1 COMPLETE: 10/10 steps**; **Phase 2 COMPLETE + UX polish**; 87 passing tests)

**Progress:** Phase 2 fully implemented and smoke-tested. Extension is in daily-usable state: single shared chat panel with project switching, markdown preview, text annotation, three-column layout (sidebar / file editor / chat), `.md` files open as rendered preview. User confirmed "the app looks good now" (2026-05-21).

**Next Milestone:** Phase 3 — auto-compact at >75% context, folder-delete watcher, MCP config UI (IMPL-GUIDE Steps 15-18).

**Blockers:** None.

> **Phase checklist:**
> - ✅ Spec drafted
> - ✅ Spec finalized (open questions resolved)
> - ✅ Phase 2 spikes complete (CLI invocation, context-window monitoring, `/compact` injectability)
> - ✅ Design complete (DESIGN.md + IMPLEMENTATION-GUIDE.md drafted)
> - ✅ Implementation guide ready
> - ✅ Prototype working — single-project end-to-end (IMPL-GUIDE Phase 1 10/10; 87 passing tests; F5-ready)
> - ✅ Multi-project working (shared panel, project switching, concurrent sessions, sidebar listing)
> - ⬜ Auto-compact at 75% context working
> - ⬜ End-to-end demo (project authored across multiple days produces a finished .md set)

### What We Have

**Extension source** (`/home/vincent/agentDesktop/src/`):

| File | Role |
|---|---|
| `extension.ts` | Activation, command registration, `openProject` closure, session/OutputChannel maps |
| `shared-chat-panel.ts` | **Single** `WebviewPanel` shared across all projects; routes messages per active project |
| `webview-main.ts` | Browser-side script (bundled → `out/webview.js`): markdown render, hljs, quote_text |
| `webview-protocol.ts` | Shared `ToWebview` / `FromWebview` / `TranscriptMessage` types (no vscode import) |
| `chat-html.ts` | Pure HTML template with inline CSS (markdown + hljs theme); loads `out/webview.js` |
| `chat-webview.ts` | `ChatWebviewPanel` class (kept for type re-exports; `SharedChatPanel` is the live panel) |
| `session-manager.ts` | Per-project turn orchestrator: spawn → JSONL stream → transcript → turn_complete |
| `project-store.ts` | `globalState` wrapper for `ProjectStoreEntry` per folder path |
| `projects-tree-provider.ts` | Activity-bar sidebar: project nodes + file tree, click → `agentDesktop.openProjectChat` |
| `projects-tree-helpers.ts` | Pure `sortFsEntries` helper (dirs-first, alpha) |
| `workspace-manager.ts` | Writes `~/agent-desktop-projects/agent-desktop.code-workspace` |
| `chat-panel-registry.ts` | Thin Map wrapper used only by unit tests now; logic moved to `extension.ts` |
| `activation-check.ts` | `claude --version` gate |
| `jsonl.ts` | 30-line async NDJSON splitter |
| `claude-spawn.ts` | Declarative spawn config + `buildArgs` + `spawnClaude` |
| `scaffold.ts` | `copyDirectoryRecursive` for codeatlas seeding |
| `paths.ts` | `slugify` + `defaultProjectPath` |
| `commands/new-project.ts` | "New Project" flow; calls `openProject` callback |
| `commands/open-recent.ts` | QuickPick over stored projects; calls `openProject` callback |
| `commands/open-project.ts` | Folder-picker + AGENT-warm-up.md validation; calls `openProject` callback |
| `commands/open-chat.ts` | Exports `FRESH_PROJECT_SEED` + `OpenProjectFn` type only |
| `commands/quote-in-chat.ts` | "Quote Selection in Chat": finds project for active file, sends `quote_text` to panel |
| `commands/recent-items.ts` | Pure QuickPick item builder |

**Build outputs:** `out/extension.js` (~34 KB), `out/webview.js` (~1.8 MB, includes marked + highlight.js)

**Tests:** 87 passing across 11 test files (vitest). All vscode-free.

**VS Code config:** `.vscode/launch.json` has `preLaunchTask: "build"` → F5 always rebuilds both bundles first.

### Key Design Decisions (Phase 2 additions)

| Decision | Choice |
|---|---|
| Panel architecture | **Single `SharedChatPanel`** — one `vscode.WebviewPanel`; `switchToProject()` replays transcript on project switch. No per-project tabs. |
| Webview script delivery | Bundled via esbuild (`src/webview-main.ts` → `out/webview.js`); loaded via `asWebviewUri` with CSP using `panel.webview.cspSource` |
| Markdown rendering | `marked.parse()` on `turn_complete`; `hljs.highlightElement()` on each `<pre><code>` block; plain `<pre>` during streaming |
| Text annotation | `agentDesktop.quoteInChat` (Cmd+Shift+Q / right-click menu): finds project by file path prefix, sends `quote_text` to shared panel |
| Auto-file-open | **Removed** — no file opens automatically on project open or tab switch; user navigates via sidebar tree |
| `openProject` pattern | Single closure in `extension.ts`; passed as `OpenProjectFn` callback to all command handlers (no registry/extensionUri plumbing through every layer) |
| Background sessions | Sessions for all projects stay alive; non-active projects' messages are silently dropped by `senderFor`; transcript replayed on next switch |

---

## Next Actions

1. **Phase 3 — auto-compact (IMPL-GUIDE Step 15)** — After each `turn_complete`, if `context_pct > 0.75`, dispatch `/compact` via a separate `claude -p --resume` spawn. Emit `compact_started` / `compact_done` to webview. Wire into `SessionManager.prompt()`.
2. **Phase 3 — folder-delete watcher (Step 16)** — `vscode.workspace.createFileSystemWatcher` per project; on root-delete event, remove from store, dispose session + OutputChannel, show toast.
3. **Phase 3 — MCP config UI (Steps 17-18)** — `src/mcp/config-surface.ts` shelling out to `claude mcp {list,add-json,remove}`; settings panel inside the shared chat panel webview (collapsible section above transcript).
4. **Phase 4 — polish + packaging (Steps 19-22)** — tool-allowlist setting wired into `buildArgs`; `--max-budget-usd` from `agentDesktop.budget.perTurnUsd`; resume-failure modal; `vsce package` + all 6 SPEC success criteria.

**Deferred:**
- Windows support (macOS + Linux first)
- Marketplace publishing (local install only until v1 proven)
- Cross-project synthesis (out of scope for v1)

---

## Session Logs

1. **Session 1: Project kickoff** (2026-05-14) — Initialized project docs. First-draft SPEC framed as "fan-out to N agents." README, AGENT-warm-up, HANDOFF populated.

2. **Session 2: Spec walkthrough and pivot** (2026-05-15) — Walked through 8 open questions. Project shape pivoted to "each Claude instance is its own project." Locked: webviews, sidebar, New + Open commands, MCP/skill integrations, auto-`/compact`. SPEC rewritten and approved.

3. **Session 3: Spec review pass** (2026-05-15) — Incorporated external review: clarified topology (no openclaw helper), security implication of dropping `--allowedTools`, split Q1 into detection + injectability sub-experiments, tightened SC#6.

4. **Session 4: Phase 2 spike — `claude` CLI behavior** (2026-05-15) — Ran three spike experiments (fresh, --resume, /compact over stdin). Confirmed event taxonomy, usage metadata location, Plan A `/compact` works. Open Questions #1 and #2 resolved.

5. **Session 5: DESIGN.md drafted** (2026-05-15) — End-to-end DESIGN.md: 15 decisions covering topology, argv, stdio, parser, session-id schema, seeding, activation, auto-compact, edit handling, folder-delete, MCP-inversion seam, tool-allowlist, latency budget. Architecture diagrams included.

6. **Session 6: Decision 9 verification** (2026-05-15) — Confirmed `.mcp.json` as per-project MCP config file. Bonus flag discoveries: `--add-dir`, `--max-budget-usd`, `--disallowedTools`, `--input-format stream-json`, `--fork-session`. DESIGN Decision 9 marked resolved.

7. **Session 7: codeatlas inspection** (2026-05-15) — Cloned `ngyihsin/codeatlas` to `/tmp/codeatlas`. Scaffold lives at `template/` (not repo root). SPEC and DESIGN updated to reflect actual scaffold layout. Bundled snapshot path confirmed as `extension/resources/scaffolds/codeatlas/`.

8. **Session 8: IMPLEMENTATION-GUIDE.md drafted** (2026-05-15) — End-to-end IMPLEMENTATION-GUIDE with 4 phases × ~22 steps. Resolved SPEC Q3 (MCP UI), Q6 (resume failure), Q7 (webview ergonomics), Q8 (MCP discovery). Phase 2 design work complete pending user review.

9. **Session 9: IMPL-GUIDE Phase 1 Step 1 — extension scaffold** (2026-05-15) — `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `src/extension.ts` (stub), `resources/icon.svg`, `.vscode/launch.json`. Codeatlas snapshot copied to `extension/resources/scaffolds/codeatlas/`. `npm run build` → 2,377-byte `out/extension.js`. F5-ready.

10. **Session 10: Phase 1 Step 2 — activation gate** (2026-05-15) — `src/activation-check.ts`: `checkClaudeAvailable()`. `ExtensionState` tri-state in `extension.ts`. Failure path shows warning with "Get Claude Code" button.

11. **Session 11: Phase 1 Step 3 — jsonl parser + unit tests** (2026-05-15) — `src/jsonl.ts`: 30-line NDJSON splitter. `vitest.config.ts`. Spike fixtures copied to `test/unit/fixtures/`. 7 tests, 7/7 pass.

12. **Session 12: Phase 1 Step 4 — claude spawn config** (2026-05-15) — `src/claude-spawn.ts`: `CLAUDE_SPAWN_CONFIG`, `buildArgs`, `spawnClaude`. 10 tests. 17/17 pass.

13. **Session 13: Phase 1 Step 5 — project store** (2026-05-15) — `src/project-store.ts`: `ProjectStore` + `MementoLike`. 10 tests with `FakeMemento`. 27/27 pass.

14. **Session 14: Phase 1 Step 6 — New Project command** (2026-05-15) — `src/paths.ts`, `src/scaffold.ts`, `src/commands/new-project.ts`. Full New Project flow. 13 new tests. 40/40 pass. Bundle: 8.6 KB.

15. **Session 15: Phase 1 Step 7 — chat webview** (2026-05-15) — `src/chat-html.ts` (pure HTML renderer) + `src/chat-webview.ts` (`ChatWebviewPanel`). Split pure/vscode pattern established. 8 tests. 48/48 pass.

16. **Session 16: Phase 1 Step 8 — SessionManager** (2026-05-15) — `src/session-manager.ts` (~190 lines). Critical fix: dominant-model heuristic (Haiku vs Sonnet regression). 15 tests including spike1.jsonl end-to-end. 63/63 pass.

17. **Session 17: Phase 1 Steps 9 & 10 — seed + Recent Projects (PHASE 1 COMPLETE)** (2026-05-15) — Seed prompt auto-dispatched on new project. `agentDesktop.openRecentProject` QuickPick. `src/commands/open-chat.ts`, `src/commands/open-recent.ts`, `src/commands/recent-items.ts`. 69/69 pass.

18. **Session 18: UX polish — discoverable command entry points** (2026-05-15) — Added codicon icons to commands, `menus.view/title` buttons in Projects sidebar, `viewsWelcome` content with clickable links.

20. **Session 20: UX polish — layout, project click, markdown preview** (2026-05-21) —
    - **Remove Project**: right-click project node in sidebar → "Remove Project" modal; disposes session + OutputChannel, removes from store, resets panel if that project was active.
    - **Three-column layout**: `SharedChatPanel.show()` now calls `workbench.action.setEditorLayout` (two columns, 60/40) before creating the panel, wrapped in try/catch so panel creation always proceeds even if the layout command fails.
    - **Project click broken**: `item.command` on collapsible tree nodes does not fire reliably in VS Code. Replaced `registerTreeDataProvider` with `createTreeView` and `treeView.onDidChangeSelection` — fires on every click including collapsible nodes. Removed `item.command` from project nodes.
    - **Silent failure fix**: `void show().then(...)` swallowed rejections silently. Changed to `.then(...).catch(err => showErrorMessage(...))` so failures are visible.
    - **File column tracking**: added `SharedChatPanel.viewColumn` getter (reports actual column the panel is in). `openFileInPrimaryColumn` always opens files in the opposite column from the chat, regardless of which column the chat ended up in.
    - **Markdown preview**: clicking a `.md` file in the sidebar focuses the file column (via `workbench.action.focusFirstEditorGroup` / `focusSecondEditorGroup`), then calls `markdown.showPreview` directly — only one tab opens (the rendered preview), no source tab.
    - **User confirmed**: "the app looks good now."

19. **Session 19: Phase 2 — multi-project sidebar + shared panel + UX fixes** (2026-05-18 – 2026-05-20) — Large session covering the full Phase 2 implementation and smoke-test UX fixes:
    - **Sidebar click → open chat**: registered `agentDesktop.openProjectChat` command; wired as `item.command` on project tree nodes.
    - **`ChatPanelRegistry`** (`src/chat-panel-registry.ts`): `revealIfOpen`, `register`, `remove`, `get`; 7 tests.
    - **`workspace-manager.ts`**: `syncCodeWorkspace` writes/updates `~/agent-desktop-projects/agent-desktop.code-workspace`; 5 tests.
    - **`commands/open-project.ts`**: real implementation (folder picker + AGENT-warm-up.md validation).
    - **Sidebar refresh fix**: `onProjectStored` callback fires `treeProvider.refresh()` immediately after `store.set()`; `agentDesktopHasProjects` context key controls `viewsWelcome` display.
    - **Column layout fix** (later removed): `openProjectChat` awaited `showTextDocument` before creating panel; `onDidBecomeActive` re-opened file on tab switch. Both subsequently removed per user request (no auto file open).
    - **UX reference**: reviewed `github.com/ThinkerYzu/agent-desktop-env` — three-panel web app (file tree / rendered markdown / chat). Key gaps identified: markdown rendering, text annotation.
    - **Markdown rendering**: `marked` + `highlight.js` installed. `src/webview-protocol.ts` (shared types). `src/webview-main.ts` (browser-side bundle). esbuild updated to produce `out/webview.js`. `chat-html.ts` updated to external script + markdown/hljs CSS.
    - **Text annotation ("Quote in Chat")**: `src/commands/quote-in-chat.ts`; `agentDesktop.quoteInChat` command; Cmd+Shift+Q keybinding; right-click context menu entry. Sends `quote_text` to panel which formats selected text as markdown blockquote in input.
    - **Auto file open removed**: per user feedback, removed `showTextDocument` calls from `openProjectChat`. `ViewColumn.Beside` used so panel opens beside current focus without forcing any file open.
    - **`SharedChatPanel`** (`src/shared-chat-panel.ts`): single `WebviewPanel` shared across all projects. `switchToProject()` replays transcript; `senderFor()` returns per-project `ChatSender` that only forwards when that project is active. Replaces per-project `ChatWebviewPanel` creation.
    - **Extension rewired**: `extension.ts` now holds `sessions: Map<string, SessionManager>` + `outputChannels: Map<string, vscode.OutputChannel>` + `SharedChatPanel`. `openProject` closure handles session creation + panel switch. All command handlers receive `OpenProjectFn` callback.
    - **CSP fix**: `script-src` was using specific file URI; fixed to use `panel.webview.cspSource` (VS Code extension origin token). This was causing the webview JS to be silently blocked, making the chat disappear on form submit.
    - **Button type fix**: `<button type="button">` prevents native form submission if script ever fails to load.
    - **Build task**: `.vscode/tasks.json` + `preLaunchTask: "build"` in `launch.json` — F5 always rebuilds both bundles.
    - **Final test count: 87/87 passing.**

---

## Document Web

**Related Documents:**
- [SPEC.md](SPEC.md) — Requirements and constraints *(Approved)*
- [DESIGN.md](DESIGN.md) — Architecture and design decisions
- [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md) — Code-level details
- [README.md](README.md) — Project overview

---

**Last Updated:** 2026-05-21
