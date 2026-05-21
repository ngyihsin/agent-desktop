# Open Questions

> Things we don't yet understand. **Maintained continuously.** Unlike docforge, this is a first-class document because mysteries are central to onboarding.
>
> A long list here is intellectual honesty, not failure. The goal is not to empty this file — it is to know what is in it.

## How to Use

Every question gets an ID (Q1, Q2, ...). Questions are **never deleted from the record** — when answered, they move to the "Resolved" section with the resolution. This preserves the record of what we were once confused about.

## Archival Policy

The Resolved section grows over time. For long-running projects (years), it will eventually exceed practical reading length. Apply this rule:

- When the Resolved section exceeds ~50 entries **or** this file exceeds ~500 lines, archive older entries.
- Archive by moving them to `OPEN-QUESTIONS-ARCHIVE.md` (or `OPEN-QUESTIONS-ARCHIVE-YYYY.md` for annual archives). Keep the Q-id; do not renumber.
- Active questions and the 20 most recently resolved questions stay in this file.
- Archived questions still count: they cannot be re-asked under a new ID. Search the archive before opening a new question.

Each entry has:

- **Trigger:** what made you ask this question
- **Code location:** where the mystery lives, with `path:line`
- **Already tried:** what you did to investigate
- **To try next:** what you'd do with more time
- **Confidence:** 0% (black box) → 100% (just need to write it up)

---

## Active Questions

### Q1: _(short title)_

- **Trigger:** _(what made you stop and notice)_
- **Code location:** `path/to/file.ext:LINE`
- **Already tried:** _(read surrounding code? read commit? checked docs?)_
- **To try next:** _(git blame, ask in IRC, run with debugger, etc.)_
- **Confidence:** _(e.g., 20%)_
- **Related concepts / flows:** _(CONCEPTS Concept #3, FLOWS Flow #1)_

### Q2: ...

---

## Patterns Worth Watching

Recurring shapes of confusion. If multiple questions look alike, the underlying issue might be a single missing concept.

- _(e.g., "Several Q's involve Mojo serialization — possibly the IPC concept is undertaught and deserves its own deep-dive.")_

---

## Resolved Questions

When a question is answered, move it here with the resolution. Do not delete.

### Q0 (Example): How does X work?

- **Original question:** ...
- **Resolved on:** YYYY-MM-DD, session N
- **Resolution:** _(short answer + link to where it now lives)_
- **Now documented in:** CONCEPTS.md → "Concept Name", or FLOWS.md → "Flow Name"
- **Verification:** ✓ / ◐ / ?

---

## Question Hygiene Tips

1. **Tag confidence honestly.** "100%" should be rare. If you're at 100%, write the doc and resolve the question.
2. **Re-read this file periodically.** Old questions sometimes answer themselves once you understand more.
3. **A question with no "to try next" is a stalled investigation.** Decide whether it's worth pursuing or accept it as a known gap.
4. **Resolutions cite where the answer now lives.** A resolved question with no destination doc means the knowledge will be lost again.
