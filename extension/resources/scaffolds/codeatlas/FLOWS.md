# Flows

> Filled in **Phase 5**. Each flow is a concrete, user-visible behavior traced through the codebase as a call chain.

## How to Read This Document

A "flow" answers the question: **when the user does X, what code runs, in what order, across which modules?**

Each flow entry has:

- A **trigger** — what user action or external event starts it
- A **call chain** — ordered steps with `path:line` references
- **Cross-module / cross-process boundaries** marked
- **Verification tags** per step
- **Last verified against commit** for drift tracking

Flows are how abstract concepts (CONCEPTS.md) connect to concrete behavior. If a concept makes no sense, finding it in a flow often clarifies it.

---

## Flow: _<User-Visible Action>_

**Trigger:** _(what starts this — a button click, a network packet, a timer fires, etc.)_
**Last verified against commit:** _(short hash — required. Phase 7 cannot drift-check without it.)_
**Last verified date:** _(YYYY-MM-DD)_
**Overall status:** ◐ Read-only

### Sequence Diagram (Required)

A mermaid `sequenceDiagram` is the default for every flow. Render it before committing — mermaid fails silently on syntax errors.

```mermaid
sequenceDiagram
    participant User
    participant UI as path/a.ext
    participant Core as path/b.ext
    participant Renderer

    User->>UI: Click Reload
    UI->>Core: RequestReload()
    Core-->>Renderer: Mojo IPC: ReloadMsg
    Renderer->>Renderer: ProcessReload()
    Renderer-->>Core: Mojo IPC: DidReload
    Core-->>User: page updates
```

**Diagram verification:** ◐ Read-only — same tag rules as prose claims. A confidently rendered diagram looks more authoritative than the same claim in text, so verify with the same discipline.

### Call Chain

The table is for grep, citation, and detail. The diagram above is for fast comprehension.

| # | File:Line | Function / Symbol | Verification |
|---|---|---|---|
| 1 | `path/a.ext:55` | `HandleClick()` | ✓ |
| 2 | `path/b.ext:120` | `RequestReload()` | ◐ |
| 3 | `path/c.ext:300` | `IPC::Send(ReloadMsg)` | ◐ |
| 4 | _(cross-process boundary)_ | | |
| 5 | `other_proc/d.ext:80` | `OnReloadMessage()` | ? |
| 6 | … | | |

### Cross-Module / Cross-Process Boundaries

| Step → Step | Boundary Type | Mechanism |
|---|---|---|
| 2 → 3 | Module: UI → Browser core | Direct call |
| 3 → 5 | Process: Browser → Renderer | Mojo IPC |

These boundaries are usually where bugs hide. Flag them clearly.

### Open Questions Raised

- See OPEN-QUESTIONS.md → Q?

### Related Concepts

- See CONCEPTS.md → "Concept Name"

### Notes

_(What surprised you about this flow? Anything counterintuitive?)_

---

## Flow: _<Next Action>_

_(repeat structure)_

---

## Flow Index

| Flow Name | Trigger | Status |
|---|---|---|
| | | |
