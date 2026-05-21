# AGENT Warm-Up

**You are about to help a human understand a large, unfamiliar codebase.**

Read this file at the start of EVERY session. It is the single bootstrap file.

## Project Identity

- **Project name**: <PROJECT_NAME>
- **Codebase path**: <CODEBASE_PATH>
- **Primary language(s)**: <LANGUAGES>
- **Notes directory**: this directory (where you found this file)

> Replace the three angle-bracket placeholders above when you first set up this template, then leave them alone. The notes directory is self-referential and needs no edit.

> For monorepos with multiple distinct subprojects, create one notes directory per subproject. See `EXAMPLES.md` → "Monorepo with Multiple Codebases".

## Session Bootstrap Sequence

Execute these steps in order. Do not skip.

### Step 1: Determine Session Type

Read the **state block** at the top of `HANDOFF.md`. It is an HTML comment with this shape:

```
<!-- DOCFORGE-ONBOARD STATE
state: pre-bootstrap | onboarding | continuing
phase1_complete: true | false
last_session: <integer>
last_session_date: YYYY-MM-DD
last_verified_commit: <short-hash> | —
-->
```

Route by the `state` field:

- `pre-bootstrap` → This is the **first-ever session**. Go to Step 2A.
- `onboarding` → Onboarding has started but Phase 1 is not complete. Go to Step 2A and resume the in-progress phase.
- `continuing` → Phase 1 is complete. Go to Step 2B.

If the state block is missing or malformed, treat it as `pre-bootstrap` and tell the user the block must be repaired before the next session.

### Step 2A: First-Time or In-Progress Onboarding

1. Read `ONBOARD-GUIDE.md` in full.
2. Read `WRITING-STYLE.md` — every doc you write must follow these rules.
3. Tell the user: "I see this is the first onboarding session. I'll walk through the phases in ONBOARD-GUIDE.md. We start with Phase 1: Ignorance Scan, which is code-free."
4. Begin Phase 1. **Stop after each phase and wait for the user.**
5. At session end: set `state: onboarding` in the HANDOFF.md state block. When Phase 1 completes, set `phase1_complete: true`. When Phase 6 produces the first CLAUDE.md, set `state: continuing`.

### Step 2B: Continuing Session

1. Read these files in order, briefly:
   - `CLAUDE.md` — distilled context (this is your "always-on" memory)
   - `HANDOFF.md` — what was done last session and what is next
   - `ONBOARD-CHECKLIST.md` — what is complete vs. pending
   - `OPEN-QUESTIONS.md` — outstanding mysteries
2. Summarize for the user in 3-5 bullets:
   - What is already understood (high level)
   - What is pending in the checklist
   - What HANDOFF.md suggests doing next
   - Top 1-2 open questions (if any)
3. Ask: "Do you want to (a) continue with the suggested next step in HANDOFF, (b) tackle a specific concept or flow, or (c) re-verify drifted docs (Phase 7)?"
4. **Wait for the user.** Do not start work until they choose.

## Behavioral Rules (Always)

These rules apply across all phases and sessions. They are the canonical version; `CLAUDE.md` references this section rather than duplicating it.

### Code as Truth

When the code and a document disagree, the code wins. Update the document. Do not ignore the discrepancy. Add an entry to `OPEN-QUESTIONS.md` if the cause of the divergence is unclear.

### Verification Tagging

Every claim you write into `CONCEPTS.md` or `FLOWS.md` must be tagged:

- ✓ **Verified** — read the code AND confirmed by running, debugging, or an authoritative doc
- ◐ **Read-only** — read but not executed or tested
- ? **Speculation** — inferred, not confirmed

Default to ? if unsure. It is far better to mark something as speculation than to claim verification you did not perform.

This rule applies to **diagrams as well as prose**. A confidently rendered diagram looks more authoritative than the same claim in text, so verify it the same way.

### Use Sub-Agents for Exploration

Do not dump large files into the main conversation. When you need to read 5+ files or a long file, spawn a sub-agent or Explore task and have it return a summary with file paths and line numbers. The main conversation stays focused.

### Cite File:Line for Every Code Claim

Any claim about how the code works must reference `path/to/file.ext:LINE` or a line range. Without a citation, it is speculation.

### Don't Assume the User Knows Project Vocabulary

If you use a project-specific term (a class name, a subsystem name, a domain concept), explain it the first time in this session, even if it appears in CLAUDE.md. The user may have forgotten.

### Render Diagrams Before Committing

Mermaid fails silently on syntax errors. Before saving a doc with a new mermaid block, paste the source into [mermaid.live](https://mermaid.live) or run `mmdc` locally. An unrendered diagram that "looks fine" can mislead the reader for months.

### Write for a Global Audience

Notes are read by developers using English as a second language and by future AI sessions. Follow `WRITING-STYLE.md`: short sentences, no idioms, define every term on first use, prefer a mermaid diagram over a long prose explanation. A human technical writer should review any doc that is treated as authoritative.

### What NOT to Capture

The notes directory may be committed to git or shared with another AI session. Do not write the following into any file:

- API keys, tokens, passwords, certificates
- Internal hostnames or URLs that are not public
- Customer names, employee names, or any personally identifying information found in code or comments
- Vendor contract terms, license keys, or pricing information

If you see something sensitive in the code, do not copy it. Reference its location (`path:line`) and describe it in general terms.

### Update Docs at Session End

Before ending a session, update:

1. `HANDOFF.md` — current state, next suggested step, **and the DOCFORGE-ONBOARD STATE block** at the top of the file
2. `ONBOARD-CHECKLIST.md` — tick off what was completed
3. `OPEN-QUESTIONS.md` — add new mysteries, resolve solved ones
4. `logs/YYYY-MM-DD-session-NN-<slug>.md` — full session log
5. `CLAUDE.md` — only if a genuinely fundamental insight was reached

If you are tempted to update CLAUDE.md every session, you are probably adding too much. CLAUDE.md changes rarely.

### Stop and Wait

Phases are designed to be interactive. Do not run multiple phases in a single agent turn. After each phase, summarize what was produced and ask the user how to proceed.

## What This Project Is NOT

- Not a place to write new design proposals (this template is for understanding, not designing).
- Not a wiki to record every detail. `CLAUDE.md` must stay lean.
- Not a one-shot task. Understanding is ongoing; the checklist tracks progress.

## What Success Looks Like

A new AI session, given only `AGENT-warm-up.md` and the docs it points to, can reach the same level of operational understanding the user has — within one session, without re-exploring the codebase from scratch.

If a new session would have to start over, the docs failed. Fix them.

---

**Now: execute Step 1 above.**
