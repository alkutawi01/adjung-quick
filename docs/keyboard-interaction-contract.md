# Keyboard Interaction Contract (Phase 3, pre-implementation)

Status: audit/define document only, per ChatGPT (director) instruction —
no keyboard code yet. Maps physical keys to the SAME product actions
already defined in `state/actions.js` — per `docs/core-reading-ui-contract.md`
§0 ("Input mechanism ≠ product action"), this document invents zero new
actions and zero new state. A future `keyboardOpenBrief()`-style
device-specific handler function is explicitly the wrong shape — every
key maps to one of the 9 existing action creators, full stop.

**Explicit non-goal, per ChatGPT:** Quick has no "Focus Mode" as a
product mode. This term surfaced earlier in project discussion and must
not be revived here just because an `F` key mapping was once discussed.

---

## Key mapping table

| Key | Maps to | Status |
|---|---|---|
| `↑` / `↓` | Context-dependent — see clarification below | LOCKED direction of travel + LOCKED per-context mapping; exact wrap-around behavior OPEN (see §A) |
| `Enter` | `OPEN_BRIEF` | LOCKED |
| `Esc` | `CLOSE_BRIEF` / `GO_BACK` (context-dependent, per contract §10's existing ladder) | LOCKED |
| `Backspace` | Candidate alias for the same `GO_BACK`/`CLOSE_BRIEF` ladder as `Esc` | PROPOSAL — not decided whether both keys fire the same action or `Backspace` is left unbound to avoid colliding with browser back-navigation instinct |
| `←` | Back to previous context (topic level), per contract §10 | PROPOSAL — candidate alias for `GO_BACK`, not locked as distinct from `Esc` |
| `→` | Navigate to next context (open Brief on highlighted story, or advance selection) | PROPOSAL — not decided whether this duplicates `Enter`/`↓` or is left unbound |
| `Space` | Candidate for Release | PROPOSAL — explicitly NOT auto-assigned just because Space is a common app convention elsewhere, per ChatGPT's instruction. Needs Izzat's confirmation before binding. |
| `Home` / `End` | Jump to first/last item in the currently focused list (Topics or Active Set) | PROPOSAL — usefulness not yet established for Quick's list sizes (capacity ~6-12) |
| `Tab` / `Shift+Tab` | Focus traversal between the three major regions (Topic Wheel / Active Set / Brief) on desktop | LOCKED as a general accessibility requirement (already implied by §19 Accessibility & Focus Contract), exact traversal order OPEN |
| `F` | **Not assigned. No Focus Mode exists in this product.** | Explicitly rejected as a feature — retained in this table only to document that it was considered and dropped, so it doesn't silently resurface later. |

Only `Enter` → `OPEN_BRIEF` and `Esc` → `CLOSE_BRIEF`/`GO_BACK` are LOCKED
by this document. Everything else is PROPOSAL, per ChatGPT's explicit
instruction not to lock ambiguous mappings — these need Izzat's decision
before implementation, listed together in the "Open decisions for Izzat"
section below.

### Clarification, per ChatGPT audit: `↑`/`↓` is context-dependent, LOCKED

Not a new decision — a direct consequence of two things already settled
(§B's selection≠opening-Brief distinction, and Phase 2B's contained
Brief-scroll fix already shipped in `ui/src/style.css`):

```
Focus: Topic Wheel  →  ↑/↓  →  SELECT_TOPIC
Focus: Active Set   →  ↑/↓  →  SELECT_STORY
Focus: Brief        →  ↑/↓  →  scroll WITHIN Brief only — never changes Story selection
```

The third case matters specifically because Quick's no-page-scroll
principle means Brief can have its own internal scroll region when
content is long (verified in Phase 2B) — while keyboard focus is inside
that region, `↑`/`↓` must stay scoped to scrolling it, never leak out to
changing `selection.highlightedStoryId` behind the open Brief. This isn't
new state or a new action — it's an implementation rule about which
DOM element currently owns the keydown handler.

---

## A. Topic navigation

```
↑ / ↓  (Topic Wheel focused)
   ↓
SELECT_TOPIC
```

**[OPEN]** Behavior at the ends of the topic list is not decided:
- **Stop** — `↓` on the last topic does nothing (no wrap).
- **Wrap-around** — `↓` on the last topic moves back to the first (`Semua`).

Not assumed either way. `SELECT_TOPIC` itself is unaffected by which
choice is made — this is purely about what index the keyboard handler
computes next, not a new action or state shape.

---

## B. Active Set navigation

```
↑ / ↓  (Active Set focused)
   ↓
SELECT_STORY
```

**Explicit distinction, per ChatGPT: selection ≠ opening Brief.**
`SELECT_STORY` only moves `selection.highlightedStoryId` (already
non-mutating of `activeSet`/`brief`, per the reducer's existing tests) —
arrow-key navigation through the Active Set must never itself open a
story. Opening requires a separate, deliberate `Enter` per §C. This
mirrors the existing two-step keyboard interaction pattern already
implied by `docs/core-reading-ui-contract.md` §8 (select-then-activate,
as opposed to touch's single-step tap-to-open).

---

## C. Brief

```
Enter → OPEN_BRIEF
Esc   → CLOSE_BRIEF
```

**LOCKED focus-return requirement, per ChatGPT:** when Brief closes via
`Esc`, keyboard focus must return to the story card that opened it — not
to `<body>` or some arbitrary default. This is a focus-management
requirement on the eventual component implementation, not a new state
field: `state.brief.storyId` (already existing) already carries the
information needed to know which card to refocus; `selection.highlightedStoryId`
should already point at that same story (contract §6/§8's existing
select-then-open two-step guarantees this), so returning focus is a DOM
operation reading already-available state, not new state to add.

Concretely, the required focus trace:

```
Topic[2]
   ↓ ↓ (navigate)
Story[4]
   ↓ Enter
Brief[Story4]
   ↓ Esc
Story[4]   ← focus returns here, not <body>
```

---

## D. Release

**[OPEN, per ChatGPT]** No key is assigned yet. `Space` is the obvious
candidate (common "action" key in many apps) but is explicitly NOT
pre-assigned here — per ChatGPT's instruction, familiarity elsewhere is
not sufficient justification on its own. Whatever key is chosen dispatches
the existing `RELEASE_STORY` action — no new action needed, only a
keybinding decision.

---

## Focus Management

This is, per ChatGPT, the single most important part of Phase 3 — every
action in this document can be technically correct while keyboard-first
Quick still "feels broken" if focus is mishandled. Three focus zones
already exist implicitly in the state/UI:

```
Topic focus   (Topic Wheel)
Story focus   (Active Set — selection.highlightedStoryId)
Brief focus   (Brief, when open)
```

Required behavior:
- Moving between zones (`Tab`/`Shift+Tab` on desktop, or an implicit
  zone change like opening Brief) must always land focus on a real,
  visible, interactive element — never lose focus to `<body>`.
- Closing Brief must restore focus to the triggering story card (§C),
  not just close the panel visually.
- This applies BEFORE any single key mapping in the table above is
  considered "done" — a correctly-dispatching `Esc` that also drops
  focus to `<body>` does not satisfy this contract.

---

## Device-neutral action layer (no device-specific functions)

Per ChatGPT's explicit instruction — the wrong shape:

```
keyboardOpenBrief()
touchOpenBrief()
```

The right shape — already true of the codebase, this document only
reaffirms it applies to keyboard too:

```
Keyboard Enter
     ↓
OPEN_BRIEF
     ↑
Touch/tap (future Touch Interaction Contract)
```

Every key in this document's table dispatches one of the 9 existing
`state/actions.js` action creators. A future Touch Interaction Contract
will map gestures onto the SAME action creators — this document does not
define touch behavior (already partially sketched as PROPOSAL in
`docs/core-reading-ui-contract.md` §9), only keyboard.

**Mobile note:** this contract is for physical keyboards. Whatever ships
for mobile touch interaction must still dispatch through the identical
action/reducer path — no keyboard-specific code path is allowed to
produce state mobile touch interaction couldn't also produce, and vice
versa.

---

## Open decisions for Izzat

Per ChatGPT's instruction — proposals only, nothing here is locked except
`Enter`→`OPEN_BRIEF`, `Esc`→`CLOSE_BRIEF`/`GO_BACK`, and the general
`↑`/`↓` navigation direction:

1. **`→` key** — bound to something (advance/open), or left unassigned?
2. **`Space`** — bound to Release, or something else, or unassigned?
3. **`Home`/`End`** — worth building for Quick's list sizes, or skip?
4. **`F`** — confirmed: NOT a Focus Mode trigger, not building this. (Only
   listed to close the question, not actually open for reconsideration
   unless Izzat explicitly wants to revisit it.)
5. **`Backspace` vs `Esc`** — does `Backspace` alias to the same
   back/close ladder, or stay unbound (to avoid colliding with browser
   back-navigation muscle memory)?
6. **Topic Wheel wrap-around** — stop at the ends, or wrap?

---

## Acceptance test plan (for Phase 3 implementation, not run yet)

Per ChatGPT's specification — recorded here so implementation has a fixed
target, not decided/run by this document:

1. `↑`/`↓` → Topic selection changes correctly.
2. `↑`/`↓` → Story selection changes correctly (Active Set focus).
3. `Enter` → Brief opens with the highlighted story.
4. `Esc` → Brief closes.
5. `Esc` after close → focus/context returns correctly to the triggering story (per §C's focus trace).
6. Release (once a key is assigned) → Active Set replacement behaves identically to the existing mouse/dispatch-tested behavior (`RELEASE_STORY`, no self-refill).
7. Rapid repeated key input → no duplicate release / race condition (dispatch is synchronous through `reduce()`, but the test should confirm no double-fire from key-repeat).
8. Arabic content → focus and `dir="auto"` direction remain correct under keyboard navigation (building on the RTL fix already verified in Phase 2B).
9. Mobile → confirms no keyboard-only code path produces a state mobile touch interaction couldn't also produce.
10. A focus trace is logged/assertable during tests (per the `Topic[2]→Story[4]→Brief[Story4]→Story[4]` example above), not just boolean `brief.open` assertions — richer signal for catching focus-loss bugs specifically.

---

## What this document deliberately does NOT do

Per ChatGPT's explicit instruction: zero keyboard event-handling code is
written here. No mapping beyond `Enter`/`Esc`/`↑`/`↓`'s direction is
locked. Focus Mode is explicitly rejected as a concept, not deferred.
Touch/gesture mapping is out of scope (separate future contract). The six
open decisions in the section above must go to Izzat before
implementation begins.
