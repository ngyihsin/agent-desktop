# Session Log Template

> Save each session as `logs/YYYY-MM-DD-session-NN-<short-slug>.md`.
> Example: `logs/2026-05-08-session-03-mojo-ipc-deep-dive.md`
>
> Logs are **investigation records**, not diaries. Capture what you explored, what you concluded, and the evidence — so a future you (or another AI) can audit the reasoning.

---

# Session NN — _<Short Slug>_

**Date:** YYYY-MM-DD
**Phase(s) worked on:** _(e.g., Phase 4 on Concept #3)_
**Goal stated at session start:**

_(One sentence. What did we set out to do?)_

---

## Exploration Path

A chronological record of what was actually done. Steps and dead-ends both.

1. _(action — e.g., `rg "class URLRequest" net/`, found definition at `net/url_request/url_request.h:88`)_
2. _(observation)_
3. _(decision — e.g., "decided to follow the constructor's caller chain instead of the destructor")_
4. _(...)_

Include dead-ends. Future-you wants to know what didn't work, not just what did.

## Findings

What we learned, in order of importance.

### Finding 1: _<Name>_

- **Claim:** _(precise statement)_
- **Evidence:** `path:line` references, observed behavior, doc citations
- **Confidence:** ✓ / ◐ / ?
- **Where this should be documented:** _(CONCEPTS.md → ..., or FLOWS.md → ..., or stays here)_

### Finding 2: ...

## New Open Questions

Questions raised during this session. Add them to `OPEN-QUESTIONS.md` (cross-link by Q-id).

- **Q?: _<title>_** — short summary

## Resolved Open Questions

If we answered something previously in `OPEN-QUESTIONS.md`, note it here.

- **Q?: _<title>_** — resolved by _(reasoning / evidence)_. Moved to the Resolved section in OPEN-QUESTIONS.md.

## Doc Updates Made

What we wrote into the persistent docs.

- `OVERVIEW.md`: _(none / what changed)_
- `CONCEPTS.md`: _(none / what changed — concept name, lines, tag changes, verification hash)_
- `FLOWS.md`: _(none / what changed — flow name, verification hash, diagram render check)_
- `CLAUDE.md`: _(none / what changed — should rarely change)_
- `OPEN-QUESTIONS.md`: _(added/removed/updated)_
- `ONBOARD-CHECKLIST.md`: _(updated which phases / concepts / flows, tech-writer review status)_
- `HANDOFF.md`: _(state block updated: state, phase1_complete, last_session, last_session_date, last_verified_commit)_

## What I'd Try Next

The agent's recommendation for the next session. Cross-link to HANDOFF.md if updated.

- **Suggested next step:**
- **Why:**
- **Estimated effort:**

## Tools Used This Session

- _(e.g., ripgrep for file search, clangd for symbol resolution, sub-agent for trace, web search for docs)_

## Reflections (Optional)

Anything worth remembering about the **process** itself, not just the codebase. E.g.:

- "Sub-agent trace returned partial results when the call chain crossed processes — need to be explicit about that next time."
- "Spent too long on Q3; should have parked it earlier and moved on."
