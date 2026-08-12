# Core Reading UI Contract

Status: audit/define document only, per ChatGPT (director) instruction —
**no React, no components, no UI code yet.** This document exists so
Desktop and Mobile can be built afterward as two renderings of ONE
interaction/state contract, not two separate systems that happen to look
similar. Grounded in what's already real: `state/model.js`,
`state/actions.js`, `state/reducer.js`, `lab/engine.js`.

Per ChatGPT's explicit instruction: do not build "desktop first, mobile
later." Define one contract; both platforms render from it.

---

## 0. The core principle this whole document enforces

```
Input mechanism  ≠  Product action
```

Keyboard Enter, a touch tap, and a mouse click are three different INPUT
MECHANISMS that must all resolve to the same `OPEN_BRIEF` action already
defined in `state/actions.js`. A swipe-release gesture resolves to the
same `RELEASE_STORY` action a keyboard shortcut would. This document does
not invent new actions for new input devices — every interaction below is
mapped onto the 9 action types that already exist (`SELECT_TOPIC`,
`SELECT_STORY`, `OPEN_BRIEF`, `CLOSE_BRIEF`, `GO_BACK`, `RELEASE_STORY`,
`SWITCH_LANGUAGE`, `PIN_STORY`/`PRIORITIZE_STORY`/`REMOVE_STORY` — editor
only) plus two new ones this document identifies as missing (§12, §13).

---

## 1. Desktop layout states

Three-column layout, per ChatGPT:

```
| Topic Wheel | Active Set / News | Brief / Reading |
```

- **Topic Wheel** (left) — dispatches `SELECT_TOPIC`. Filters the
  discovery/backlog list only — per `state/model.js`'s locked principle,
  topic selection never filters the Active Set itself.
- **Active Set / News** (center) — renders `state.activeSet`. Each slot
  dispatches `SELECT_STORY` on focus/hover-equivalent, `OPEN_BRIEF` on
  activation.
- **Brief / Reading** (right) — renders `state.brief`. Present whenever
  `brief.open === true`; empty/placeholder state otherwise. This column
  never causes a Topic Wheel or Active Set re-render — `OPEN_BRIEF` does
  not touch `activeSet` (already a non-mutating action per the reducer's
  own tests).

All three columns are simultaneously visible — no column ever fully hides
another region on desktop. This is a **layout state**, not a navigation
stack.

---

## 2. Mobile layout states

**[LOCKED principle, per ChatGPT]** Mobile is not "three columns squeezed
into one." Mobile is a **state transition** over the same state tree:

```
Topics  →  Active Set / News  →  Brief / Full-screen reading
```

Only one region is visible at a time. Moving between regions does NOT
require new action types — it's a *rendering* decision (which region has
screen focus), driven by the same state:

| Mobile screen | Condition on state | Equivalent desktop column |
|---|---|---|
| Topics | no story highlighted yet, OR explicit back-navigation to topic level | Topic Wheel |
| Active Set / News | `selection.highlightedStoryId` set, `brief.open === false` | Active Set / News |
| Brief / Full-screen reading | `brief.open === true` | Brief / Reading |

`OPEN_BRIEF` on mobile transitions the visible screen from News to Brief;
on desktop the same action just populates the already-visible Brief
column. **Same action, same reducer, different rendering** — this is the
concrete proof of §0's principle.

---

## 3. Topic navigation

`SELECT_TOPIC` (existing action, unchanged). Desktop: click/keyboard-focus
a Topic Wheel entry. Mobile: tap a topic, which also performs the Topics →
Active Set/News screen transition (§2) as a rendering side-effect of
`selectedTopic` changing — not a separate navigation action.

**[OPEN]** Exact Topic Wheel visual form (literal wheel/carousel vs. list)
is a visual-design decision, not decided here — this document only fixes
that topic selection dispatches `SELECT_TOPIC` and filters discovery, not
the Active Set.

---

## 4. Active Set presentation

Renders `state.activeSet` (array of `{slot, storyId, representationId}`,
per `state/model.js`). Order note: this document does not mandate a
specific visual ordering (chronological / editorial-score / slot-index) —
**[OPEN]**, flagged for Izzat, since it's a reading-experience choice, not
an architecture one. What IS fixed: the Active Set's *membership* (which
stories occupy it) is entirely engine-controlled per `lab/engine.js` and
`state/reducer.js` — the UI only renders whatever `state.activeSet`
already is; it never independently decides membership.

Each slot must be able to render regardless of `activeSet.length <
activeSetCapacity` (per L-023, already noted in `model.js`) — empty/fewer
slots is a normal, not an error, state.

---

## 5. Brief presentation

`state.brief = { open, storyId }`. When open, resolves to one
`story_clusters` row via the already-locked Representation Selector
(`state/representation.js`) under the reader's current
`userContext.selectedLanguages`. Desktop: right column. Mobile:
full-screen (§2). No separate "reading mode" state is needed — `brief`
already fully describes it.

---

## 6. Selection

`SELECT_STORY` (existing action). Moves `selection.highlightedStoryId`
only — confirmed non-mutating of `activeSet`/`brief` by the reducer's own
existing tests. This is the "focus without committing" action: keyboard
arrow-key navigation, touch scroll-highlight, or mouse hover all resolve
here before a separate activation input (§8/§9) triggers `OPEN_BRIEF`.

---

## 7. Release / swipe

`RELEASE_STORY` (existing action) — the only way (besides
`SWITCH_LANGUAGE`) a slot opens, per `state/actions.js`'s own comment.
Desktop: an explicit release control (button/keyboard shortcut) on a
slot or within the Brief. Mobile: a swipe gesture on a slot resolves to
the same `RELEASE_STORY` action — swipe is an INPUT MECHANISM (§0), not a
new action.

**Consequence already proven in `vertical-slice.js`:** releasing a story
does not immediately re-admit it to its own vacated slot (the bug found
and fixed in `state/reducer.js`'s `RELEASE_STORY` case) — this holds
regardless of which input mechanism triggered the release.

---

## 8. Keyboard interaction

**[PROPOSAL — mapping table, not yet Izzat-approved]**

| Key | Action |
|---|---|
| Arrow keys | `SELECT_STORY` (move highlight) |
| Enter | `OPEN_BRIEF` (on highlighted story) |
| Escape / Backspace | `GO_BACK` or `CLOSE_BRIEF` (context-dependent, see §10) |
| A dedicated release key (e.g. `R`, or Shift+Enter — not decided) | `RELEASE_STORY` |
| Number/letter keys (not decided) | `SELECT_TOPIC` quick-jump |
| Tab / Shift+Tab | move focus between Topic Wheel / Active Set / Brief regions (desktop only — no mobile equivalent, three regions aren't simultaneously present) |

Exact key bindings are UI-phase decisions — this table exists to confirm
every keyboard action maps onto an EXISTING action type, introducing zero
new ones. This is what "keyboard-first" (a locked product requirement)
concretely means at the contract level: full functional parity with
touch/mouse using only these mappings, not a reduced keyboard subset.

---

## 9. Touch interaction

**[PROPOSAL]**

| Gesture | Action |
|---|---|
| Tap (topic) | `SELECT_TOPIC` |
| Tap (story card) | `SELECT_STORY` then `OPEN_BRIEF` (tap-to-open, no separate highlight step on touch — unlike keyboard's two-step arrow-then-Enter) |
| Swipe (on a slot) | `RELEASE_STORY` (§7) |
| Swipe-back / edge-swipe (in Brief) | `GO_BACK` / `CLOSE_BRIEF` (§10) |
| Pull-to-refresh (discovery list only, never Active Set) | not an existing action — **[OPEN]**, needs product definition; likely maps to a re-fetch trigger, not a state-mutating action at all |

Tap's single-step semantics (vs keyboard's two-step select-then-activate)
is a legitimate per-mechanism UX difference — §0's principle is that the
RESULTING action is the same (`OPEN_BRIEF`), not that every mechanism
must have identical step-count.

---

## 10. Back behaviour

`GO_BACK` and `CLOSE_BRIEF` both exist in `state/actions.js` — the
comment there notes `GO_BACK` is "alias-able to `CLOSE_BRIEF` depending on
context." This document makes that context explicit:

```
Brief open (mobile: full-screen reading)
   ↓ back input
CLOSE_BRIEF  →  Active Set / News screen

Active Set / News screen, topic filter active (mobile)
   ↓ back input
SELECT_TOPIC(null)  →  Topics screen  -- NOT a new action; reuses SELECT_TOPIC

Topics screen (mobile, top level)
   ↓ back input
platform back (exit app / browser back) — outside this contract's scope
```

Desktop has no equivalent "back stack" — all three columns are always
visible (§1), so `GO_BACK`'s only meaningful desktop target is closing an
open Brief, i.e. desktop `GO_BACK` ≡ `CLOSE_BRIEF` always. Mobile
`GO_BACK` is context-sensitive per the ladder above. **[OPEN]** whether
mobile back is a dedicated hardware/gesture back or an in-UI back button
— platform-convention decision, not fixed here.

---

## 11. Language switch

`SWITCH_LANGUAGE` (existing action). Per `state/reducer.js`, this is
atomic: recomputes representation for every cluster under the new
language context and re-selects the Active Set from scratch (not
incrementally) — the ONLY action besides `RELEASE_STORY` that changes
Active Set membership, and it also closes any open Brief (per the
existing reducer). UI consequence: a language switch is a visibly
disruptive action (Active Set contents may change, Brief closes) — the
control for it should not read as a lightweight toggle. **[OPEN]**
whether the UI warns the reader before switching if it would change >N
slots — a UX-polish question, not decided here.

### 11a. Language Switch Contract (added 2026-08-12, UI Phase 1)

Triggered by Izzat's question during UI Phase 1 scoping: what happens
when a reader switches edition mid-read and either (a) the story has no
coverage in the new edition, or (b) the story's current Bidang doesn't
exist as a category in the new edition's taxonomy (e.g. ms-MY's `Agama`
has no equivalent Wheel entry in the Arabic edition)?

**Locked principle: a language/edition switch changes representation
context, not a taxonomy translation.** Two previously-conflated concepts
must stay separate:

```
Story Cluster
       │
       ├── Representation Layer   — "is there coverage/text in this language?"
       │        (Malay / English / Arabic)
       │
       └── Edition Placement Layer — "where does this story live in this edition's taxonomy?"
                (ms-MY / en / ar, each independent per docs/edition-taxonomy.mjs)
```

**Switch behavior, per case:**

- **Representation exists + taxonomy has an equivalent field** — switch
  proceeds normally, story continues, field re-resolves under the new
  edition's own placement (never assumed identical to the old field —
  per the locked "editions don't share taxonomy" principle).
- **Representation exists but the field doesn't exist in the new
  edition's taxonomy** (the `Agama` example) — story continues (coverage
  is available), but the selected Wheel category does **not** carry over
  as-is; re-resolve under the new edition's own placement rules, which
  may differ from the source edition's category entirely. Never
  auto-map one edition's category name onto another's as if they were
  translations of each other.
- **No representation at all in the requested edition** (e.g. a
  Malaysia-local story with no Arabic-language source coverage) — **do
  not force the switch to fail or show an empty/404 state.** Keep the
  current representation, optionally inform the reader (e.g. "Tiada
  liputan Arab untuk berita ini — kekal dalam versi asal"), per
  ChatGPT's framing: this is normal for a multi-edition editorial system
  (real international portals like CNN Arabic don't have 1:1 story
  parity with CNN English either) — not an error state to eliminate.

**No guarantee a story exists in all editions.** Adjung Quick is not
attempting to be "one portal in three languages" — it's one system with
several editions that share a story graph only where real coverage
overlaps. §4's Active Set membership rule (engine-controlled, UI only
renders) and this section's fallback-to-current-representation rule
both follow from the same principle: never force a UI state the
underlying data can't actually support.

**State-management implication (not implemented here):** `SWITCH_LANGUAGE`
should conceptually resolve two separate concerns —
`representationSelector` (`currentStoryId`, `availableRepresentations[]`,
`selectedRepresentation`) and `editionContext` (`locale`, `taxonomy`,
`selectedField`) — rather than treating "language" as a single flat
value that implies both at once. This is a design note for whoever
implements the eventual `state/representation.js` changes, not a schema
or code change made by this document.

---

## 12. Save

**[GAP — no `SAVE_STORY` action type exists yet in `state/actions.js`.**
This document identifies it as needed, does not add it (no code changes
here, per scope). Implementation note for the eventual action:

```
SAVE
  ↓
personal layer (saved_stories row, per docs/identity-schema-design.md)
```

**[PROPOSAL, per ChatGPT audit — not LOCKED] Two explicit actions, not a
toggle:**

```
SAVE_STORY
UNSAVE_STORY
```

rather than one `SAVE_STORY` action carrying a `saved: true/false`
payload. Reasoning: explicit action pairs are clearer for the reducer, for
debugging/observability, and for accessibility (a screen reader announcing
"Save" vs "Unsave" as distinct, named actions rather than inferring state
from a boolean). This mirrors the existing pattern of
`OPEN_BRIEF`/`CLOSE_BRIEF` being two actions rather than one toggle.
Flagged as PROPOSAL, not LOCKED — needs confirmation before
implementation, same as every other item in this document not explicitly
marked LOCKED.

Per **P-006** (`docs/identity-schema-design.md` §6) and Invariant E.1
(`docs/identity-personal-layer-audit.md`), Save must be a strictly
additive personal-layer write — it must NEVER touch `activeSet`,
`editorial_score`, or the Ranked Queue. Concretely: dispatching a future
`SAVE_STORY` action must be provably non-mutating of Engine state, the
same way `PIN_STORY`/`PRIORITIZE_STORY`/`REMOVE_STORY` already are in the
current reducer (verified by reference-identity equality in
`state/test.js`). This is a UI contract requirement to carry into that
action's eventual reducer case, not a suggestion.

**Save requires authentication** (per `docs/identity-personal-layer-audit.md`
— anonymous readers have no personal-layer rows). UI consequence: a Save
control must handle "not logged in" — **[OPEN]** whether that means
prompting login inline, disabling the control, or something else; not a
Fasa 1A/this-slice decision (this whole document is pre-implementation).

---

## 13. History

**[GAP — same status as Save: no dedicated action exists yet, but the
event is not new.]** `RELEASE_STORY` already exists and already appends
to `state.history` (in-memory placeholder, per `model.js`) — the Fasa 1A
`history_entries` table (already built, `db/schema-identity.sql`) is the
real, persistent version of that same event. So unlike Save, History does
NOT need a new action type — `RELEASE_STORY`'s existing reducer case is
where the real `history_entries` INSERT would eventually be wired in
(implementation, not this document).

**This is the "two cards that look similar but have different
lifecycles" distinction ChatGPT flagged:**

```
Save                          Release
  ↓                             ↓
personal layer                Active Set transition (Engine)
(saved_stories)                 +
                               History (personal layer, history_entries)
```

Save touches ONLY the personal layer. Release touches the Engine's Active
Set (a slot opens, per the existing reducer) AND the personal layer
(a HistoryEntry is recorded) in the same dispatch. The UI must not
present these two controls as symmetric variations of "one button" — they
have genuinely different blast radius, and conflating them in the
component design would reintroduce exactly the kind of hidden-coupling
bug the `RELEASE_STORY` release-immediately-refills bug already taught
this project to watch for.

---

## 14. Anonymous vs authenticated UI

Per `docs/identity-personal-layer-audit.md` §6 (Session vs Identity):
reading itself (Topic Wheel, Active Set, Brief, all of §1–§11) requires no
account — fully anonymous. Only Save (§12) and, by extension, viewing a
persisted Save/History list, require authentication.

**[OUT OF SCOPE for this document, per ChatGPT's explicit instruction]**
the login UX itself and the Transfer/Discard/Selective transition screen
(L-050) are NOT designed here — that's the separate "Transition Slice"
ChatGPT named when scoping the Identity vertical slice. This document
only notes WHERE in the reading UI an authentication boundary is crossed
(the Save control, §12), not how login itself looks.

---

## 15. Sponsor placement

**[OPEN — no prior decision exists to audit.]** Not discussed anywhere in
this project's prior architecture work (Stream A, Identity Layer, or any
locked decision list). Flagged here only because ChatGPT's audit list
named it — needs a genuinely new product decision from Izzat (placement,
frequency, whether it exists in v1 at all) before this document can say
anything concrete. Not blocking the rest of this contract.

---

## 16. Theme hook

`userContext.theme`, per `state/model.js`: **derived from `selectedTopic`
via a theme resolver (`topic → ThemeTokens`), never hardcoded per-topic UI
branching** — already noted as O-009, still OPEN/PROPOSAL in that file.
This document doesn't resolve O-009; it confirms the UI contract's job is
just to render whatever `theme` resolves to, generically — no
`if (topic === 'PRU') { ... }` style branches in component code once
built.

---

## 17. No-image constraint

Per `project_adjung_no_ai_strategy` / product constraint already locked
outside this document: Quick has zero images anywhere in the reading
surface — no thumbnails, no hero images, no icons standing in for
publisher logos. Every layout state in §1–§2 must be designed as
text-only from the start, not "text-only for now, images later." This is
also why mobile's Active Set/News cards (§4) can be visually dense
(no image real estate to reserve) — a layout advantage worth keeping in
mind when this document's successor gets to actual visual design.

---

## 18. No-page-scroll reading principle

**[PROPOSAL, inferred from "mobile-first so it never becomes a phone
problem" — Izzat's stated mobile-first motivation, not yet an explicit
rule Izzat has confirmed in these words.]** The Brief (§5) is a bounded
reading surface — headline + brief text only (per the product's
zero-article, RSS-headline-and-brief model, see
`docs/identity-personal-layer-audit.md`'s correction on this point). If
briefs are short by construction, the Brief screen should not need
internal scrolling in the common case. **[OPEN]** whether this is an
enforced constraint (briefs get truncated/edited to fit) or just an
expected-but-not-guaranteed outcome of briefs being short — needs Izzat's
confirmation before being treated as a real design constraint rather than
an observation.

---

## 19. Accessibility & Focus Contract

**[PROPOSAL, per ChatGPT audit]** Not a bolt-on feature — keyboard-first
(§8) is a core, already-locked product interaction model, and keyboard
navigation IS accessibility navigation. Every interactive element defined
by §1–§13 (Topic Wheel entries, Active Set slots, Brief controls, Save/
Release controls) must have:

- **Keyboard focus** — reachable via Tab/arrow-key navigation (§8), never
  mouse/touch-only.
- **Visible focus state** — a reader using only a keyboard must be able to
  see where focus currently is at all times.
- **Logical focus order** — matching the reading order implied by §1's
  desktop columns / §2's mobile screen sequence, not DOM-accidental order.
- **Screen-reader label** — every control has a name a screen reader can
  announce (relevant to §12's Save/Unsave distinction above — two
  differently-labeled actions are more accessible than one ambiguous
  toggle).
- **Reasonable touch target size** — for the touch mechanism (§9), on
  mobile.

This section is PROPOSAL — Izzat has not confirmed these as binding
requirements in these terms — but is included because retrofitting
accessibility after component code exists is materially more expensive
than building it into the contract now, and the keyboard-first requirement
already implies most of it.

---

## Clarification: Anonymous History is not `history_entries`

Per ChatGPT's audit — worth stating precisely, since §13/§14 could be
misread otherwise: an anonymous reader's in-session history (what they've
already released, for UI purposes like "already seen" styling) is a
**UI/session concept only** — it is NOT the same thing as the real,
persistent `history_entries` Supabase table, which requires an
authenticated `user_id` and cannot exist for anonymous readers at all (per
`docs/identity-personal-layer-audit.md`). So:

```
Anonymous  History  = transient, UI/session-local, no persistence
Authenticated History = history_entries row, persistent, per-user
```

`state/model.js`'s current `history` array (in-memory placeholder) is
closer to the anonymous concept today; wiring it to real
`history_entries` only makes sense once a reader is authenticated.

---

## OPEN items — classified by urgency (per ChatGPT audit)

Not all six OPEN items from the original list carry equal weight. Splitting them:

**Refinement — can wait, does not block building the UI shell:**
- §3 Topic Wheel visual form
- §4 Active Set ordering
- §9 Pull-to-refresh
- §15 Sponsor placement
- §16 Theme treatment

**Interaction decision — needed before final UI behaviour, but does not
block starting shell/state-integration work (must not be hard-coded
until Izzat approves):**
- §10 Mobile back mechanism
- §11 Language-switch warning threshold
- §18 No-scroll enforcement

Implementation consequence: a UI shell and its state wiring may begin
before these three are resolved, but their specific behavior must stay
provisional/overridable, not hard-coded, until Izzat decides.

---

## What this document deliberately does NOT do

Per ChatGPT's explicit instruction: zero React, zero component code, zero
visual design (colors, spacing, typography). No new action types are
added to `state/actions.js` by this document — §12/§13 identify a real
gap (`SAVE_STORY` doesn't exist yet) but implementing it is out of scope
here. The Transfer/Discard/Selective login UX (L-050) is explicitly
excluded, per ChatGPT, as a separate future "Transition Slice." Six items
are flagged OPEN for Izzat (§3 Topic Wheel visual form, §4 Active Set
ordering, §9 pull-to-refresh, §10 mobile back mechanism, §11 language
switch warning threshold, §15 sponsor placement, §18 no-scroll
enforcement) — none of them block moving forward with UI implementation
using the LOCKED parts of this contract, per ChatGPT's own framing that
these are refinements, not blockers.
