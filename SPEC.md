# Spec: Agent Desktop

**Project:** Agent Desktop
**Created:** 2026-05-14
**Last Updated:** 2026-05-15
**Status:** Approved
<!-- Status lifecycle: Draft = initial writing, Review = shared with user for feedback, Approved = open questions resolved, ready for design -->

---

## Navigation

**Project Docs:** [README](README.md) | [SPEC](SPEC.md) *(you are here)* | [DESIGN](DESIGN.md) | [IMPLEMENTATION-GUIDE](IMPLEMENTATION-GUIDE.md) | [HANDOFF](HANDOFF.md)

**This Document:**
- [Problem Statement](#problem-statement)
- [Goals](#goals)
- [Non-Goals](#non-goals)
- [Requirements](#requirements)
- [Constraints](#constraints)
- [Success Criteria](#success-criteria)
- [Open Questions](#open-questions)
- [Prior Art](#prior-art)

---

## Problem Statement

Writing technical documentation for a codebase (specs, design docs, architecture traces, onboarding guides) is slow, stateful, and rarely a single sitting. A useful doc-authoring effort needs:

- **Deep code exploration** — actually reading and understanding the source.
- **External context** — Jira tickets and epics, slide decks, Confluence pages, GitHub issues. The requirements and history live outside the repo.
- **Persistent iteration** — drafting, clarifying, revising, across multiple days.

A single Claude Code session in a terminal can do all of this — *for one document, on one codebase, today*. The moment the user wants to:
- Author **several documents in parallel** (different topics on the same codebase, or different codebases entirely), or
- Continue **across multiple days** without losing context, or
- See **all of a project's .md files** at once and watch them evolve as the agent edits them,

…the terminal workflow falls apart. The user ends up juggling several Claude sessions, copy-pasting Jira content by hand, losing track of which session belongs to which project, and starting from scratch every reopen.

### Background

- **Claude Code** is a stateful CLI agent (`claude` on PATH) with built-in session resume (`claude --resume <id>`), MCP server support, and skills. The primitives for external integrations and long-running conversations are already there.
- **`codeatlas`** ([github.com/ngyihsin/codeatlas](https://github.com/ngyihsin/codeatlas)) is a **codebase-onboarding** scaffold (inspected 2026-05-15 — HANDOFF Session 7). Its `template/` subdirectory contains `AGENT-warm-up.md` (the bootstrap file) plus `ONBOARD-GUIDE.md`, `ONBOARD-CHECKLIST.md`, `CLAUDE.md` (distilled memory), `CONCEPTS.md`, `FLOWS.md`, `OPEN-QUESTIONS.md`, `OVERVIEW.md`, `EXAMPLES.md`, `WRITING-STYLE.md`, `HANDOFF.md`, `README.md`, and `logs/SESSION-LOG-TEMPLATE.md`. The protocol routes claude across multi-day sessions via a state block in `HANDOFF.md` (`pre-bootstrap` → `onboarding` → `continuing`) and a phased workflow (Phase 1: Ignorance Scan → … → Phase 6: produce `CLAUDE.md`). It is **one example** of a scaffold; Agent Desktop is scaffold-agnostic.
- **VS Code** has multi-root workspaces, webviews, sidebar tree views, `SecretStorage`, and `globalState` — enough surface area to host a multi-project UI.
- **openClaw** (`/home/vincent/openclaw/openclaw/`) is a reference implementation of "drive `claude` as a subprocess" — see [Prior Art](#prior-art) for which patterns to borrow.

---

## Goals

What this project will accomplish:

1. **Host multiple doc-authoring projects in parallel** in a single VS Code window — switch between them via a sidebar; no window-juggling.
2. **Bootstrap projects from `codeatlas`** — one command instantiates the scaffold (a snapshot of `codeatlas/template/`) and starts the Claude session, which reads `AGENT-warm-up.md` and follows its bootstrap protocol. (For `codeatlas` specifically, that's a phased codebase-onboarding workflow producing a `CLAUDE.md` plus supporting docs. Other scaffolds may have other protocols — e.g., spec-driven new-project workflows that ask the user for Jira tickets or slide decks; the extension is scaffold-agnostic.)
3. **One persistent Claude session per project**, resumed across VS Code restarts, with automatic context-window management (`/compact` at >75%).
4. **Claude edits the project's .md files in place** — the .md set *is* the project's output (a finished technical document).
5. **External integrations come via Claude Code MCPs and skills** — the extension ships zero connectors; it just manages which MCPs/skills are active per project.

## Non-Goals

What this project will explicitly **not** do (to prevent scope creep):

1. **Re-implement Claude Code** — we shell out to the existing `claude` CLI.
2. **Build Jira / Confluence / Slides / GitHub connectors** — those live in Claude Code MCPs and skills (Atlassian MCP, GitHub MCP, Google MCP, etc.). The extension surfaces config, not connector code.
3. **Fan one prompt out to multiple Claudes within a project** — one Claude per project. Parallelism is *across projects*, not *across agents inside one*.
4. **Cross-project synthesis** — each project's docs are independent in v1.
5. **Cloud / remote execution** — local only.
6. **Handle Claude or MCP authentication** — auth is out-of-band; user must already be logged into `claude` and any MCP servers they want to use.

---

## Requirements

### Functional Requirements

1. **Project list sidebar** — A VS Code activity-bar view lists every open Agent Desktop project. Clicking a project makes it the active project (its chat and files come to foreground).
2. **New Project command** — Asks for a project name; defaults the location to `~/agent-desktop-projects/<name>/` (overridable); clones `codeatlas` there; registers the folder as a workspace root; starts a new Claude session; seeds it with *"read `AGENT-warm-up.md` and tell me what you need."*
3. **Open Project command** — Picks an existing Agent Desktop project folder. If a stored Claude session ID exists, runs `claude --resume <id>`; otherwise starts a fresh session.
4. **Per-project chat webview** — Each project owns a webview showing the running transcript (markdown-rendered) and a prompt input. Sending a prompt forwards to that project's Claude session.
5. **Multi-root workspace** — Each open project's folder is registered as a root in VS Code's file explorer; users navigate and view .md files / source via native VS Code UI.
6. **Auto-apply .md edits** — Claude edits via its Edit tool directly; changes hit disk; VS Code's native "file changed externally" prompt is the safety net for concurrent user edits.
7. **MCP/skill config per project** — Extension reads/writes Claude Code's per-project MCP config at **`.mcp.json` in the project root** (verified against `claude` v2.1.142 — see DESIGN Decision 9 and HANDOFF Session 6). A UI surface lets the user see active MCPs and add/remove them. Skills are typically global / user-scope; per-project skill enablement is surfaced if and where applicable.
8. **Session resume** — Extension stores Claude session ID per project (VS Code `globalState` keyed by project path). On project open, resumes via `claude --resume`. If resume fails, warns the user and offers a fresh start.
9. **Context-window monitoring** — Extension tracks per-session token usage. When usage crosses **75%**, automatically dispatches `/compact` to the session. Surfaces a small usage indicator in the chat UI.
10. **External info via MCPs/skills** — When Claude needs a Jira ticket, Confluence page, slide deck, GitHub issue, etc., it invokes the appropriate MCP server or skill. The extension does not parse or fetch this content itself.

### Non-Functional Requirements

1. **Performance** — Streaming transcript with sub-second latency; switching between projects under 500 ms.
2. **Compatibility** — VS Code latest stable; macOS + Linux primary; Windows best-effort. `claude` CLI on PATH.
3. **Reliability** — One project's session crash does not affect others. State recoverable on next launch.

---

## Constraints

1. Claude Code is invoked as a **subprocess** — no internal API access.
2. **Auth is out-of-band** — user must be logged into `claude` and any MCP servers (Atlassian, GitHub, Google, etc.) they want to use.
3. Built within the **VS Code extension API** (webviews, tree views, multi-root workspaces, `SecretStorage`, `globalState`).
4. **MCP/skill ecosystem coverage** — we depend on the ecosystem to provide connectors. If a needed integration has no MCP/skill, the user pastes content manually for now.
5. **Local only** in v1.

---

## Success Criteria

How we know v1 is done. Each criterion is objectively verifiable:

1. **New project from `codeatlas`** — Run "New Project" with default settings → folder is created at `~/agent-desktop-projects/<name>/`, sidebar shows the new project, Claude session starts, and the first message in the chat is Claude's reading of `AGENT-warm-up.md` with a list of what it needs next.
2. **External info via MCP** — In a project with an Atlassian MCP configured, ask Claude *"summarize epic PROJ-42"* → Claude pulls the epic via MCP and answers without the user pasting content.
3. **Persistent multi-day session** — Work in a project, close VS Code, reopen the next day → the chat shows the prior transcript and Claude responds with full memory of yesterday's context (verified by referring to something said the day before).
4. **Multi-project switching** — Two projects open. Switch between them in the sidebar → each shows its own chat + workspace files, no state leakage. Both sessions remain alive in the background.
5. **Auto-compact at 75%** — Run a long session until token usage crosses 75% → extension dispatches `/compact` automatically; the session continues without user action.
6. **End-to-end doc** — Create a project from `codeatlas` and iterate across at least two sessions on at least two different days. Done means **both**: (a) all required sections in the codeatlas scaffold are populated (no remaining `{{placeholder}}` markers in SPEC / DESIGN / README / HANDOFF), and (b) the user explicitly confirms the resulting document set is suitable for sharing with a teammate without manual editing.

---

## Open Questions

To be answered during Phase 2 (DESIGN). Items marked **spike** need a small code experiment before they can be decided.

1. ~~**Context-window monitoring (spike — two sub-experiments)**~~ **RESOLVED 2026-05-15 via spike** (HANDOFF session 4):
   - **Detection:** `stream_event.message_start.usage` and `stream_event.message_delta.usage` events emit `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` per turn. Effective model context = `input + cache_creation + cache_read`. The final `result.usage` event also surfaces accumulated usage; `result.modelUsage` breaks down by model (Sonnet 4.6 = 400k window, Haiku 4.5 = 200k window — both surface in this field).
   - **Action / injectability:** `/compact` **works** over `-p`-mode stdin. Sending `/compact\n` triggers a `system.compact_boundary` JSONL event and reports `num_turns: 0` (compaction does not consume a turn). Plan B (out-of-band summary + fresh resume) is **not needed**.
   - **Implementation outline for Requirement #9:** after each `result` event, compute `effective_context / context_window`; if >0.75, dispatch a separate `claude -p --resume <id>` invocation with stdin `/compact`; consume `system.compact_boundary` as confirmation. Cost of one compaction: ~$0.022 on Sonnet 4.6 (varies with transcript size).
2. ~~**`claude` CLI invocation (spike)**~~ **RESOLVED 2026-05-15 via spike** (HANDOFF session 4): openclaw's argv works as-is (we drop `--allowedTools mcp__openclaw__*`). Fresh spawn: exit 0, ~$0.027 (mostly first-turn cache creation), 12 JSONL lines for a trivial response. Resumed spawn: ~$0.006 (4-5× cheaper via cache_read). Confirmed event taxonomy: `system.{init,status,compact_boundary}`, `rate_limit_event`, `stream_event` wrapping Anthropic SDK message events (`message_start`, `content_block_start`, `content_block_delta` with `text_delta`, `content_block_stop`, `message_delta`, `message_stop`), `assistant` (full message), `user`, `result` (with `total_cost_usd`, `usage`, `modelUsage` per-model). Session ID persists across `--resume` invocations. Each invocation = one process; multi-turn = repeated invocations with `--resume`.
3. **MCP/skill config UX** — Settings panel inside the project webview, or expose the underlying config file and let the user edit it directly?
4. **Project-list storage** — VS Code `globalState` keyed by project folder path, or a JSON file in `~/.agent-desktop/`? `globalState` is simpler; a file is more portable across machines.
5. **Scaffold versioning** — Pin "New Project" to a specific `codeatlas` commit, or always pull `main`? Pinning is safer; always-latest is simpler.
6. **Session-resume failure mode** — If `claude --resume <id>` fails (session pruned, Claude Code reinstalled, etc.), start fresh + warn, or block until the user decides?
7. **Webview chat ergonomics** — Markdown rendering, code-block syntax highlighting, slash-command surfacing in UI, image paste — what's table stakes vs. nice-to-have for v1?
8. **MCP discovery / onboarding** — Does the extension recommend MCPs to install for a new `codeatlas`-style project (Atlassian, GitHub, etc.), or leave that entirely to the user?
9. **Tool-allowlist policy** — Should the extension restrict claude's built-in Bash / WebFetch tools by default for doc-authoring safety? v1 default is "no restriction" (single-user developer tool). DESIGN should reserve a settings-level toggle so worried users can opt in to a tighter allowlist.

---

## Prior Art

The closest existing reference for "drive `claude` as a long-running subprocess" is **openClaw** (`/home/vincent/openclaw/openclaw/`), which spawns `claude` (and Codex / Gemini) to power channel-based assistants (Telegram, Discord, etc.). We borrow its proven patterns and skip what doesn't apply.

### Adopt directly

- **Spawn argv for `claude`** (confirmed in `extensions/anthropic/cli-backend.ts:32-55`):
  ```
  claude -p --output-format stream-json --include-partial-messages --verbose \
         --setting-sources user --session-id <id> [--resume <id>]
  ```
  We **drop** `--allowedTools mcp__openclaw__*` — we want claude's built-in Read / Edit / Write for the .md authoring workflow.

  **Security implication:** dropping the allowlist means claude has access to its **full** built-in tool surface (Bash, WebFetch, Edit, Write, Read, etc.), not just file-edit tools. Tool-allowlist policy becomes a design-phase concern (Open Question #9). v1 default: unrestricted, suitable for a single-user developer tool. A configurable allowlist is an explicit deferred enhancement.
- **Stdio model** — `stdio: ["pipe", "pipe", "inherit"]` (`src/acp/client.ts:143-149`): stdin and stdout piped to the parent, stderr inherited (visible in extension logs).
- **JSONL event shapes** — output is line-delimited JSON, one event per line: `agent_message_chunk`, `tool_call`, `tool_call_update`, `available_commands_update`, plus session metadata events (`src/acp/client.ts:78-104`).
- **Declarative spawn config separated from lifecycle** — single config constant (mirroring `CliBackendPlugin.config`), consumed by a small lifecycle function. Easier to test and evolve.

### Defer but design for

- **MCP inversion** — openClaw runs an MCP server alongside the spawn so claude can call back into the parent for tools (`bundleMcp: true`, `bundleMcpMode: "claude-config-file"` in `cli-backend.ts:27-28`). For Agent Desktop, the same pattern enables VS Code-aware tools later (`agentdesktop__open_file_at`, `agentdesktop__show_diff`, etc.). DESIGN.md must leave room for this; v1 ships without.

### Skip for v1

- **ACP and openclaw's three-process topology** — openclaw uses ACP (`@agentclientprotocol/sdk`) to abstract across claude / codex / gemini, and its `spawn(...)` at `src/acp/client.ts:143` launches openclaw's own `acp` subprocess, **not** `claude` directly — the `claude` process is a grandchild of the gateway. Agent Desktop only spawns `claude`, as a **direct child** of the extension host (one fewer process). We inherit openclaw's stdio + NDJSON patterns but **not** its process topology — DESIGN.md readers should not model `client.ts`'s spawn invocation verbatim.

### Files to keep open when drafting DESIGN.md

| openClaw file | Why |
|---|---|
| `extensions/anthropic/cli-backend.ts:1-80` | Argv + I/O contract — direct template |
| `src/acp/client.ts:107-192` | `spawn()` invocation, stdio wiring, NDJSON stream consumption |
| `src/acp/control-plane/manager.turn-stream.ts` | JSONL event shapes (single source of truth) |
| `src/mcp/openclaw-tools-serve.ts` + `tools-stdio-server.ts` | MCP-server-on-stdio template (for when we add VS Code-aware tools) |

### Doc-to-code discrepancy noted

OpenClaw's CORE-CONCEPTS doc claims `src/acp/control-plane/spawn.ts` is "the 77-line lifecycle for one subprocess." Reading the file directly: it's actually `cleanupFailedAcpSpawn` — a teardown helper for *failed* spawns. The real `spawn(...)` call is at `src/acp/client.ts:143`; per-session state lives in `src/acp/control-plane/manager.core.ts`. Worth flagging if the openClaw doc gets updated.

---

**Last Updated:** 2026-05-15
