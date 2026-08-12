# UI Implementation Readiness Audit (pre-Phase 2A)

Status: audit only, per ChatGPT (director) instruction — no React, CSS,
UI components, or new product behaviour. No OPEN/PROPOSAL item is
resolved here; this only inspects what already exists
(`state/actions.js`, `state/model.js`, `state/reducer.js`, the Identity
Layer implementation) against what `docs/core-reading-ui-contract.md`
requires, and reports gaps.

---

## 1. Which existing actions are sufficient for Phase 2A

Sufficient as-is, no changes needed:

| Action | Contract section | Status |
|---|---|---|
| `SELECT_TOPIC` | §3 Topic navigation | Sufficient |
| `SELECT_STORY` | §6 Selection | Sufficient |
| `OPEN_BRIEF` | §5 Brief presentation, §8/§9 keyboard/touch | Sufficient |
| `CLOSE_BRIEF` / `GO_BACK` | §10 Back behaviour | Sufficient |
| `RELEASE_STORY` | §7 Release/swipe | Sufficient |
| `SWITCH_LANGUAGE` | §11 Language switch | Sufficient |

`PIN_STORY` / `PRIORITIZE_STORY` / `REMOVE_STORY` exist but are
**out of scope for Phase 2A** — per `state/actions.js`'s own comment
these are single-editor Editorial Control, not reader-facing. Phase 2A is
the reading UI; these belong to a separate future editor-tooling surface,
not this phase.

**Conclusion: for pure reading (Topic → Active Set → Brief → Release →
Language), the existing action vocabulary is complete. No gap.**

---

## 2. Must `SAVE_STORY`/`UNSAVE_STORY` be added before UI implementation?

**Depends on Phase 2A's actual scope, which this document does not
decide:**

- **If Phase 2A includes a visible Save control** (per contract §12, which
  assumes Save is part of the core reading experience, not a later
  add-on) — **yes, these two actions must be added to
  `state/actions.js` and given reducer cases before that control can be
  wired**, because there is currently no action a Save button could
  dispatch. Building a Save button against nothing would mean the UI
  either fakes local-only state (drifts from Identity Layer's real
  `saved_stories` table) or someone invents ad-hoc dispatch logic outside
  the established action/reducer pattern — both are exactly the "leak
  business logic into React" failure mode already flagged as the reason
  for this checkpoint.
- **If Phase 2A is scoped to reading-only (Topic/Active Set/Brief/
  Release/Language) with Save deferred to Phase 2B** — no action gap;
  Phase 2A can proceed with the six actions in §1 alone.

This document flags the dependency; it does not choose Phase 2A's scope
— that's product-planning, for Izzat/ChatGPT to set explicitly before
implementation starts, not inferred here.

---

## 3. State shape required for Save status in the reading UI

Not present today. `state/model.js`'s current shape has no concept of
"is this story saved by the current reader" anywhere. If Save is in
scope for Phase 2A (per §2), the state model needs an addition along
these lines (naming/shape illustrative, not a locked proposal):

```
state.personal = {
  savedStoryIds: Set<storyId>,   // populated from saved_stories on load/auth change
}
```

Card/Brief components would read `state.personal.savedStoryIds.has(storyId)`
to render Save vs Unsave, rather than deriving it from any Engine state
(`activeSet`, `rankedQueue`) — keeping with P-006 (personal references
must never read back into or be confused with Engine state, per
`docs/identity-schema-design.md` §6). Populating this set from real
Supabase requires a fetch keyed on the authenticated `user_id`
(`db/schema-identity.sql`'s `saved_stories` table already supports this
query directly — `SELECT story_id FROM saved_stories WHERE user_id = ?`,
already exercised by `db/identity-test.js`) — that wiring is
implementation, not decided here.

---

## 4. Representing authenticated vs anonymous Save behaviour, without building login UX

`state/model.js`'s `userContext.identity` already exists as a documented
placeholder (`null` today, explicit comment: "do not build real
authentication logic against this field yet"). This document proposes —
without implementing — that Phase 2A can represent the boundary with
nothing more than that field's presence:

```
identity === null   →  anonymous  →  Save control disabled/hidden
identity !== null    →  authenticated  →  Save control active
```

This requires **no login UX** — just a state field the UI reads. The
actual mechanism that ever sets `identity` to non-null (a real Supabase
Auth session) is explicitly out of scope, per ChatGPT's repeated
instruction not to build the Transition Slice / login flow yet. Phase 2A
can therefore build the Save control's two visual/interactive states
(enabled vs disabled-or-hidden) against a manually-toggleable `identity`
value for development/testing, without any real auth wiring existing yet.
**[OPEN, not decided here]** whether "not authenticated" means hiding the
Save control entirely or showing it disabled with a login prompt — a UI
copy/UX decision per contract §12, not resolved by this audit.

---

## 5. Other contradictions between state/reducer architecture and the Core Reading UI Contract

- **`reduce()`'s `context` parameter (`rankedQueue`, `control`) is
  currently supplied by test/demo code (`vertical-slice.js`,
  `state/test.js`), not by any real data source.** Phase 2A's shell will
  need `rankedQueue` sourced from real Supabase `story_clusters` (already
  proven reachable — same tables `db/ingest-production.js` verified) and
  `control` from a real Editorial Control instance, not the in-memory
  `lab/control.js` stand-in used for testing. This is a wiring gap, not
  an architecture contradiction — the reducer's shape doesn't need to
  change, only what supplies its `context` argument.
- **`state.history` (in-memory placeholder, per `model.js`'s own
  comment) does not reflect the real, persistent `history_entries` table.**
  Per `docs/core-reading-ui-contract.md` §13's Anonymous-vs-Authenticated
  History clarification, this is expected — but Phase 2A must not
  present `state.history` as if it were the authenticated reader's real
  history; doing so would silently violate the distinction that document
  already drew. Any "History" UI surface in Phase 2A (if in scope at all)
  needs to source from real `history_entries` for authenticated readers,
  not this placeholder array.
- No other contradiction found — the six sufficient actions in §1 map
  cleanly onto the reducer's existing non-mutating/mutating split, and
  nothing in the Core Reading UI Contract calls for a state shape the
  reducer doesn't already support (aside from the Save-status gap in §3,
  which is additive, not a change to existing shape).

---

## Summary

| Question | Answer |
|---|---|
| Existing actions sufficient for reading-only Phase 2A? | Yes |
| `SAVE_STORY`/`UNSAVE_STORY` needed? | Only if Save is in Phase 2A's scope — scope not decided here |
| New state shape needed? | Yes, if Save in scope: `state.personal.savedStoryIds` |
| Auth boundary representable without login UX? | Yes — `identity !== null` check, no new mechanism needed |
| Architecture contradictions? | None — two wiring gaps identified (`context` data source, `history` placeholder vs real table), not contract contradictions |

This document does not decide Phase 2A's exact scope (whether Save ships
in 2A or 2B) — that's the one open question blocking a fully specific
"what to build" instruction, and it belongs to Izzat/ChatGPT to set.
