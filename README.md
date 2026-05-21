# Agent Desktop

**Status:** Phase 1 — Spec (Approved)
**Created:** 2026-05-14
**Last Updated:** 2026-05-15
**Goal:** VS Code extension that hosts multiple doc-authoring Claude Code projects in parallel — each with a persistent session, a `codeatlas`-style .md scaffold, and access to external context via Claude Code MCPs / skills.

---

## Project Documentation

### Core Documentation

- **README.md** (This document) — Project overview and getting started
- **[SPEC.md](SPEC.md)** — Problem statement, requirements, constraints, and success criteria *(Approved)*
- **[DESIGN.md](DESIGN.md)** — Architecture, design decisions, and technical approach *(Phase 2 — next)*
- **[IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md)** — Detailed implementation guide with code examples *(Phase 2)*
- **[HANDOFF.md](HANDOFF.md)** — Current status, next actions, session logs (the handoff package)

### Testing Documentation

- **[TESTING-GUIDE.md](TESTING-GUIDE.md)** — Testing procedures, expected output, troubleshooting *(Phase 3)*

**Quick Links:**
- [Overview](#overview) | [Core Concepts](#core-concepts) | [Design & Architecture](DESIGN.md) | [Current Status](HANDOFF.md#current-status)

---

## Overview

Agent Desktop is a VS Code extension that turns the editor into a workspace for **doc-authoring projects driven by Claude Code**. Each project bootstraps from the [`codeatlas`](https://github.com/ngyihsin/codeatlas) scaffold (an `AGENT-warm-up.md` plus a set of .md files — SPEC, DESIGN, HANDOFF, etc.), runs one persistent Claude Code session against the project's workspace folder, and lets Claude iteratively edit those .md files into a finished technical document. The user can have **several such projects open at once** — different codebases, or different topics on the same codebase — and switch between them via a sidebar without juggling VS Code windows.

The motivation: writing a real technical document for a codebase needs deep code reading, external context (Jira, slides, Confluence, GitHub), and multi-day iteration. A bare `claude` terminal handles one such effort at a time and forgets everything on restart. Agent Desktop fixes the persistence problem and the parallelism problem, while leaning on **Claude Code's MCP and skill ecosystem** for all external integrations — the extension itself ships no connectors.

## Recent Updates

See [HANDOFF.md](HANDOFF.md) for the full changelog, session history, and next actions.

---

## Core Concepts

### Project = workspace folder + persistent Claude session + .md scaffold

Each Agent Desktop project is one folder (cloned from `codeatlas` or opened from disk), one long-lived `claude` session targeting that folder, and the .md files inside it. The .md files are both the agent's working notes and the project's output — when the project is "done," those files are the technical document.

### One Claude per project; parallelism across projects

Inside a project, there is exactly one Claude Code session. Multiple projects run in parallel, each in its own session, surfaced in the same VS Code window via a sidebar list.

### Sessions persist; context auto-compacts at 75%

Closing VS Code does not kill a project's Claude context. On reopen, the extension calls `claude --resume <session-id>` for that project. The extension also watches token usage per session and runs `/compact` automatically when usage crosses 75%, so multi-day sessions don't hit the context ceiling.

### External info lives in MCPs and skills, not in the extension

When Claude needs a Jira epic, a Confluence page, a slide deck, a GitHub issue, etc., it calls a Claude Code MCP server or skill — Atlassian MCP, GitHub MCP, Google MCP, and so on. The extension surfaces *which* MCPs/skills are active per project, but it does not implement OAuth or content parsing itself.

---

## Implementation Phases

### Phase 1: Spec (COMPLETE)
- SPEC.md drafted, walked through with the user, all 8 original open questions resolved
- Project shape pivoted from "multi-agent fan-out for tracing" to "multi-project workspace for doc-authoring"
- 8 design-phase open questions captured for Phase 2 (2 of them are spike-required)

### Phase 2: Design (NEXT)
- Two technical spikes:
  - Driving `claude` non-interactively with streaming output (CLI flags + parse format)
  - Detecting context-window usage per session
- Architecture (extension structure, webview ↔ subprocess IPC, sidebar tree-view model)
- DESIGN.md and IMPLEMENTATION-GUIDE.md

### Phase 3: Prototype (FUTURE)
- Single project end-to-end: New Project → codeatlas clone → Claude session → reads `AGENT-warm-up.md` → first response in webview
- Persistent resume across restart

### Phase 4: Multi-project (FUTURE)
- Sidebar listing, project switching, simultaneous sessions
- Per-project MCP/skill config UI

### Phase 5: Polish & publish (FUTURE)
- Auto-compact at 75% context
- Error / failure modes (resume failures, MCP unavailable, etc.)
- Marketplace listing

---

## Development Repository

**Working Directory:** `/home/vincent/agentDesktop` (extension source code TBD — none written yet; project is in spec/design phase)
**Git Branch:** TBD

---

## Related Projects

- **[ngyihsin/codeatlas](https://github.com/ngyihsin/codeatlas)** — the project scaffold that Agent Desktop's "New Project" command clones; defines the .md file set and `AGENT-warm-up.md` bootstrap protocol.
- **Claude Code CLI** — driven as a subprocess by this extension; provides session resume, MCP, and skills.

---

## Documentation Maintenance

### Documentation as a Web

**Core Principle:** This project directory is maintained as a **web of interconnected documents**, not isolated files.

- Documents are connected through **hyperlinks** (both markdown and HTML)
- Every document includes **navigation sections** at the top
- Cross-references point to **specific sections** using anchor links (#section-name)

### Agent Responsibilities

The agent (Claude) must actively maintain both **content and connections** in this documentation web:

**Content updates:**
- **Progress tracking**: Update status and milestone achievements
- **Implementation details**: Document design decisions, code structure, and technical approaches
- **Technical findings**: Record measurements, results, and key learnings
- **Architecture evolution**: Update design documents as the design evolves
- **Log maintenance**: Keep HANDOFF.md current with development activities

**Link maintenance:**
- **Add cross-references**: When creating new content, link to related existing content
- **Update navigation**: Add new documents to navigation bars on all pages
- **Verify links**: Ensure links remain valid as documents evolve

### Handoff as Complete Package

**Philosophy:** HANDOFF.md should serve as a **complete handoff package** that enables anyone to pick up the task and push forward without asking questions.

**Handoff quality test:** "Could a new team member read this and implement the next phase without asking clarifying questions?"

---

**Last Updated:** 2026-05-15
