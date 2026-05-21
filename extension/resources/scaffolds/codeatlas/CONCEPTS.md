# Core Concepts

> Filled in **Phase 3** (recommendation list with placeholders) and **Phase 4** (deep dives). Each concept gets its own section.

## How to Read This Document

Every concept entry has:

- A **tag** showing verification status
  - ✓ **Verified** — read code AND confirmed by running/debugging or authoritative doc
  - ◐ **Read-only** — read code/docs but didn't run/test
  - ? **Speculation** — inferred, not confirmed
- An **embodying file** with `path:line` reference
- A **last-verified commit hash** for drift tracking
- **Connections** to other concepts and files

When code and this document disagree, the code wins. Update this doc; do not ignore the discrepancy.

---

## Recommended Concepts (from Phase 3)

> The agent fills this list during Phase 3. Each concept starts as a placeholder; deep-dive (Phase 4) replaces the placeholder with the full entry below.

### 1. _<Concept Name>_ [?]

- **Why it matters:**
- **What breaks without it:**
- **Embodying file:** `path/to/file.ext:LINE-LINE`
- **Status:** Proposed in Phase 3, not yet deep-dived.

### 2. _<Concept Name>_ [?]

- (same structure)

### 3. _<Concept Name>_ [?]

### 4. _<Concept Name>_ [?]

### 5. _<Concept Name>_ [?]

---

## Deep Dives (Phase 4)

> One section per concept after deep-dive. Replace the corresponding placeholder above with a back-reference (e.g., "See Deep Dive: <name> below").

### Concept: _<Name>_

**Tag:** ◐ Read-only
**Embodying file:** `path/to/file.ext:42-87`
**Last verified against commit:** _(short hash — required. Phase 7 cannot drift-check without it.)_
**Last verified date:** _(YYYY-MM-DD)_

#### Analogy

_(1-2 paragraphs. Explain without code, using a metaphor from daily life. This is the one place idiomatic language is encouraged — analogies are teaching tools. The rest of the entry should follow `WRITING-STYLE.md`.)_

#### Plain-Language Explanation

_(2-4 paragraphs. What it does, why it exists, how it fits into the system. Short sentences. Define every term on first use.)_

#### Diagram

_(A mermaid `classDiagram` or `flowchart` showing how this concept relates to its callers, dependencies, and sibling concepts. Tag with ✓ / ◐ / ?.)_

```mermaid
classDiagram
    class ThisConcept {
        +method1()
        +method2()
    }
    class Caller {
        +callsIntoThisConcept()
    }
    class Dependency {
        +calledByThisConcept()
    }
    Caller --> ThisConcept
    ThisConcept --> Dependency
```

**Diagram verification:** ◐ Read-only — confirmed by reading source, not by running.

#### Code Walkthrough

```
path/to/file.ext:42-87
```

- **Line 42–48:** _(what this block does)_
- **Line 50–55:** _(...)_
- **Line 60–72:** _(...)_

> Avoid pasting the full code block here. Reference line numbers and summarize.

#### Connections

- **Called by:** `caller_a.ext:120` ✓, `caller_b.ext:88` ◐
- **Calls into:** `dependency.ext:300` ◐
- **Related concepts:** Concept #2, Concept #4
- **Related flows:** See FLOWS.md → "Flow Name"

#### Open Questions Raised

- See OPEN-QUESTIONS.md → Q3, Q5

#### Notes / Surprises

_(Things that didn't fit elsewhere. Often becomes useful later.)_

---

### Concept: _<Next Name>_

_(repeat structure)_

---

## Cross-Reference Index

A shortcut for finding "which concept does file X belong to."

| File / Path | Concept(s) |
|---|---|
| `path/to/file.ext` | Concept #1, #4 |
| | |
