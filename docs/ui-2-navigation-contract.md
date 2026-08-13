# UI-2 Navigation Contract (2026-08-13)

Status: **audit/define document, per ChatGPT — no component code yet.**
Written before Session UI-2 (Navigation Experience) implementation, per
the same discipline that produced `docs/core-reading-ui-contract.md`
before UI-1: lock the contract, THEN build both platforms against it,
rather than discover the contract mid-implementation (what happened in
UI-1.1 when the Wheel shipped reading the old classifier's vocabulary).

Reviewed against: `docs/edition-state-model.md` (editionContext/
representationPreference split), `docs/core-reading-ui-contract.md`
(existing action set, Stable Spatial Slots), `docs/production-classification-snapshot-v1.md`
(what real placement data actually looks like).

## 0. The rule this whole document enforces

**UI-2 is not the place to fix classification.**

If building UI-2 surfaces an empty Bidang, a miscategorized story, or a
low-confidence placement, that is a `classification`/`db` layer issue
(`docs/known-issues.md`, `docs/empty-bidang-policy.md`) — never a UI
workaround. Specifically prohibited: `if (topic === 'Sains') { ... }`
special-casing, or "if no news, show a different field" substitution
logic. The UI trusts `edition_story_classifications` and the production
pipeline; if that trust is misplaced, the fix happens upstream, not in a
component.

## 1. Wheel source

The Wheel's field list comes from `getEdition(activeEdition).taxonomy`
(`state/editions.js`) — **never** derived from which stories exist today
(`[...new Set(rankedQueue.map(c => c.topic))]`). This was already fixed
once, in `ui/src/App.jsx` during UI-1.1, after the Wheel initially read
the OLD classifier's vocabulary; UI-2 must not regress it.

Consequence: **every field in the edition's taxonomy is always a Wheel
slot**, whether or not it has stories today. A field is never removed,
hidden, or reordered based on today's content — the taxonomy IS the
edition's identity (`docs/empty-bidang-policy.md`: "empty Bidang stay
visible — it's the edition's identity, not a summary of today's
arrivals").

## 2. Empty field behaviour

An empty field is a normal state, not an error state. Per
`docs/empty-bidang-policy.md`, the copy reads as an editorial standard,
not a failure:

```
Sains
Belum ada berita yang memenuhi piawaian editorial hari ini.
```

Never: "Tiada berita" (reads as failure/bug). Never: silently substitute
another field's stories into an empty slot — that is exactly the
keyword-pulling trap already rejected once (mahkamah/menteri case).

## 3. Active Set source

Per the LOCKED Bidang-scoped decision (Izzat, 2026-08-12,
`state/reducer.js`'s `SELECT_TOPIC` case): the Active Set is 10 slots OF
THE SELECTED FIELD, not 10 globally-ranked slots filtered at render time.

```
Edition
  ↓
Wheel field (selectedTopic)
  ↓
Ranked candidates (within that field only)
  ↓
10 Stable Spatial Slots (activeSet)
```

**Stable Spatial Slots is unaffected and still absolute**: exactly
`state.activeSetCapacity` fixed positions, never a growing/infinite feed.
Clicking the Wheel does not open a new feed — it rebuilds the same 10
slots from a different eligible pool. This is the "working memory"
framing (`docs/adjung_quick_v1_spec` per Izzat's 11/8 correction) —
Adjung Quick is not an endless-scroll product.

If a field's ranked candidate pool has fewer than `activeSetCapacity`
eligible stories (including zero), the Active Set simply has that many
slots filled — per the existing `TEST 2c` regression
(`state/test.js`: "SELECT_TOPIC on a Bidang with no stories yields an
empty Active Set, not an error"). No backfill from other fields.

## 4. Edition switch behaviour

**Edition switch, not language switch, not translation.** Per
`docs/edition-state-model.md`'s core reframing: "language is one entry
point into an edition, not the definition of one." The reader-facing
control switches `editionContext.activeEdition` (`SWITCH_EDITION`
action), never re-labelled as "Language."

```
Reader is in: ms-MY / Politik
Reader switches to: en-global

System does NOT: "translate 'Politik' to 'Politics'"
System DOES:
  1. resolve editionContext.activeEdition = 'en-global'
  2. re-validate selectedTopic against en-global's taxonomy
     (Politik has no 1:1 en-global equivalent by name — the reducer
     already handles this: reset to null if the prior selectedTopic
     isn't valid in the new edition, per SWITCH_EDITION's existing case)
  3. rebuild the Wheel from en-global's taxonomy
  4. rebuild the Active Set from en-global's own ranked candidates —
     NOT a re-filter of the same story list, a genuinely different
     editorial universe (docs/edition-state-model.md §"What does NOT
     happen for v1": editions never mix in one Active Set)
```

The reader-facing label for this control should communicate "which
edition" (e.g. "Malaysia · Malay Edition" / "Global · English Edition"),
per ChatGPT's explicit framing — never the word "Language" alone, since
that implies translation-in-place rather than a different editorial
worldview.

## 5. Representation behaviour

Separate from edition switching. `representationPreference[]`
(`state/model.js`'s `getRepresentationPreference()`) answers a narrower
question: **within the current edition, if a story has multiple language
representations, which one to show.** This does not change
`activeEdition`, does not rebuild the Wheel, does not rebuild the Active
Set — it only affects which representation of an already-placed story
renders in the Brief/Full View.

Per `docs/core-reading-ui-contract.md` §11a (Language Switch Contract),
three cases when a representation is requested:
1. Representation + equivalent field exists → switch normally.
2. Representation exists but no equivalent field → story continues
   showing, category doesn't carry over as-is.
3. No representation at all → keep current representation, optional
   notice — never force-switch or 404.

## 6. What UI-2 does NOT do (explicitly out of scope)

- No classification/ranking logic changes.
- No new Wheel taxonomy or field additions — that's a `lab/sources.js`/
  `classification/*` change, reviewed separately.
- No Active Set capacity change (`state.activeSetCapacity` stays as
  currently configured).
- No edition-mixing / multi-edition comparison view (noted as a future,
  not-yet-designed possibility in `docs/edition-state-model.md`).

## Next

Only after this contract is confirmed: implement UI-2A (Edition
Experience — edition identity display), UI-2B (Wheel reading from
taxonomy, empty-field copy), UI-2C (Active Set, unchanged Stable Spatial
Slots), UI-2D (edition switch flow, representation flow) as renderings of
this one contract — not before.
