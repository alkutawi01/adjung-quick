# Geography Navigation Contract v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] contract document. No UI, classifier, or schema
change here.** Per ChatGPT: answer data model, navigation model, Active
Set behaviour, and empty state BEFORE any implementation —
`docs/geography-residual-navigation-policy-v1.md` established that a
navigation path is needed and rejected merging geography into the
Subject Wheel; this document defines the shape of the answer.

---

## 1. Data contract

**Question**: does geography live as `story.geography`,
`placement.geography`, or purely as residual classification output?

**Recommendation: no new column. `edition_story_classifications.field`
stays the single source of truth — add a pure derived categorization
function, not a schema change.**

Reasoning: `field` already correctly stores `Malaysia`/`Dunia` today —
the gap isn't in what's stored, it's that nothing downstream
distinguishes *which kind* of value `field` holds. The classifier's own
`EDITION_GEOGRAPHY_RESIDUAL_LABEL`
(`classification/lib/edition-taxonomy.mjs`) is already the single
authoritative list of which values are geography-residual per edition —
reusing it (rather than duplicating the Malaysia/Dunia strings
elsewhere) keeps one source of truth instead of two that could drift.

```js
// Illustrative — not implemented here.
export function isGeographyResidual(editionId, field) {
  const residual = EDITION_GEOGRAPHY_RESIDUAL_LABEL[editionId];
  return residual && (field === residual.local || field === residual.world);
}
```

**Why not a new column now**: adding a real `geography` dimension
(separate from `field`) is the more architecturally "correct" long-term
shape — and worth planning for once ranking/saved-stories/search
actually need to query geography independently of subject. But that's a
schema migration, and per this project's standing discipline
(`docs/production-data-lifecycle-v2-design.md`), migrations aren't done
reflexively. A derived function ships the reader-facing fix immediately
without one; a real `geography` column can be revisited later if/when
those downstream needs (ranking on geography, search filters) actually
materialize.

## 2. Navigation model

Three models were on the table (per `docs/geography-residual-navigation-policy-v1.md`):

- **Model 1** — Bidang Wheel + a simultaneous Lokasi selector (both
  facets active at once)
- **Model 2** — top-level mode switch: `Bidang | Lokasi`, mutually
  exclusive
- **Model 3** — geography nested inside each Bidang (rejected already,
  doubles complexity)

**Recommendation: Model 2 — a mode switch, not simultaneous facets.**

This isn't a UI preference, it follows directly from the data: a
geography-residual story exists **precisely because it has no subject
placement**. A story can never simultaneously be `field: 'Politik'` AND
`field: 'Dunia'` — they're the same column, mutually exclusive by
construction. So "Politik + Lokasi: Dunia" (Model 1's implied
simultaneous filter) is not a real, reachable combination — it would
either silently show nothing or require pretending the two facets
compose, when they structurally don't.

Model 2 matches the real shape: a reader is either browsing **by
subject** (today's Wheel, unchanged) or browsing **by location** (a new,
separate, much smaller list — just `Malaysia` / `Dunia` for `ms-MY`, not
a 14-item wheel).

## 3. Active Set behaviour

**Question**: when a reader selects `Lokasi: Dunia`, what fills the
Active Set?

**Recommendation: exactly the same mechanism `SELECT_TOPIC` already
uses — just scoped to a geography value instead of a subject value.**

```
SELECT_TOPIC('Politik')  → activeSet = rankedQueue.filter(c => c.topic === 'Politik')
SELECT_LOCATION('Dunia') → activeSet = rankedQueue.filter(c => c.topic === 'Dunia')
```

Since `c.topic` already carries whatever `field` value was placed
(subject or residual — `productionAdapter.js` doesn't distinguish
today, and per §1 doesn't need to), the existing filter mechanism works
unmodified for a residual value. No new reducer logic is needed for
*filling* the Active Set — only for the *entry point* that dispatches a
location selection instead of a topic selection.

**Explicitly not recommended**: "last Bidang + Dunia" (rejected in §2 —
not a real composable state) or "edition default" (too vague — a
reader who deliberately navigates to Lokasi: Dunia is asking for
exactly that, not a fallback).

## 4. Empty state

**Recommendation: reuse the existing empty-Bidang pattern
(`docs/empty-bidang-policy.md`) verbatim, keyed by location name instead
of Bidang name.**

```
Existing:  "Tiada berita [Bidang] buat masa ini."
New:       "Tiada berita [Lokasi] buat masa ini."
```

Same reasoning that already justified the Bidang version applies
unchanged: an honest, specific empty state ("Tiada berita Dunia hari
ini") preserves editorial clarity — it tells the reader *what's* empty,
not just *that* something is empty. No new empty-state design needed,
only feeding it a location name instead of a Bidang name.

---

## Summary — what's decided vs. what's still open

| | Decided here |
|---|---|
| Data model | Derived categorization function, no schema change |
| Navigation shape | Mode switch (Model 2), not merged/nested |
| Active Set fill | Reuse `SELECT_TOPIC`'s existing filter mechanism |
| Empty state | Reuse existing pattern, location-keyed copy |

| | Still open — implementation-phase decisions |
|---|---|
| Exact UI (tab? toggle? separate screen?) | Not specified — a UI design choice within the Model 2 shape |
| Action/reducer naming (`SELECT_LOCATION`?) | Illustrative only above, not locked |
| Whether `ar-global`/`en-global` ever get a `Lokasi` mode | Out of scope — those editions have no local-country concept at all (`local: null` in `EDITION_GEOGRAPHY_RESIDUAL_LABEL`), so this is `ms-MY`-specific by construction, not a decision to make here |

## What this document does NOT do

- Does not implement any UI, reducer action, or component
- Does not migrate any schema or add any database column
- Does not touch the classifier or taxonomy
- Does not decide the exact interaction chrome — only the shape
  (mode switch, derived data, reused filtering, reused empty state)
