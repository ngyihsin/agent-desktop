# <PROJECT_NAME> Onboarding Notes

> AI-assisted onboarding notes for understanding `<PROJECT_NAME>`. Built on the [docforge-onboard](https://github.com/your-fork/docforge-onboard) template.

## What This Is

A structured set of documents that an AI agent (and you) progressively fill in to understand a large existing codebase. The codebase being studied is at:

- **Codebase path:** `<CODEBASE_PATH>`
- **Languages:** `<LANGUAGES>`

This is **not** the codebase itself. This is the **understanding** of the codebase — captured as living documents that survive across AI sessions.

## How to Use This in a Session

1. Open your AI agent (Claude Code, Cursor, Codex, etc.).
2. Tell it: **"Read AGENT-warm-up.md"**
3. The agent will detect whether this is a first-time onboarding or a continuing session, and proceed accordingly.

That's it. Everything else is described inside `AGENT-warm-up.md`.

## Document Index

| Document | Role |
|---|---|
| `AGENT-warm-up.md` | Single bootstrap file, read every session |
| `ONBOARD-GUIDE.md` | Phase definitions and workflow |
| `ONBOARD-CHECKLIST.md` | Phase / topic completion tracking |
| `OVERVIEW.md` | What the project is, top-level structure |
| `CONCEPTS.md` | Core abstractions, deep-dived |
| `FLOWS.md` | Concrete call chains for user-visible behaviors |
| `CLAUDE.md` | ≤200-line per-session bootstrap context |
| `HANDOFF.md` | Last session summary, next step, session-state sentinel |
| `OPEN-QUESTIONS.md` | Things we don't yet understand |
| `WRITING-STYLE.md` | Writing rules for non-native readers; diagram guidance |
| `EXAMPLES.md` | Illustrative examples (Chromium, monorepos, forks) |
| `logs/` | Per-session detailed logs |

## How Far Along Are We?

See `ONBOARD-CHECKLIST.md` for the current state.

See `HANDOFF.md` for what we're doing next.

## Project-Specific Notes

_(Anything unique about this codebase that doesn't fit elsewhere — links to upstream docs, mailing lists, IRC channels, key contributors, etc.)_

- Upstream repository:
- Bug tracker:
- Mailing list / forum:
- Key documentation links:
