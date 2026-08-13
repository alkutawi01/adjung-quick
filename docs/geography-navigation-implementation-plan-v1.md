# Geography Navigation Implementation Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[x] Closed`

## SUPERSEDED 2026-08-13 — see `docs/ms-my-taxonomy-review-v1.md` §RESOLVED

Not implemented as planned here. Izzat's simpler decision (flat Wheel
list) required only 2 file changes and no new reducer/action/component —
see the actual implementation recorded in
`docs/ms-my-taxonomy-review-v1.md`.

Category: **[DECISION] planning document. No code written here.**

Per ChatGPT: before touching any UI/reducer code, name exactly what
changes, what stays untouched, and how it's verified — so implementation
(when it happens) is a small, reviewable, bounded change, not a
reopening of the Active Set/reducer architecture.

Closes the design chain:
`docs/geography-residual-navigation-policy-v1.md` (problem + option
choice) → `docs/geography-navigation-contract-v1.md` (data/nav/empty-state
contract) → this document (what actually gets touched).

---

## Components involved

| Component | Change |
|---|---|
| `state/model.js` | Add `navigationMode` to initial state (`'subject'` default) |
| `state/actions.js` | New action creator (name TBD at implementation time — see note below) |
| `state/reducer.js` | New case, reusing `SELECT_TOPIC`'s existing filter mechanism against a location value instead of a subject value |
| `classification/lib/edition-taxonomy.mjs` | No change — `EDITION_GEOGRAPHY_RESIDUAL_LABEL` already exists, read from, not modified |
| `ui/src/components/TopicWheel.jsx` | Not modified — stays the subject-mode UI exactly as-is |
| A new, small UI entry point (mode switch + 2-item Lokasi list) | New — exact component/placement is a UI design decision, not fixed here |
| `ui/src/components/ActiveSetList.jsx` | No change expected — already renders whatever `activeSet` the reducer produces, regardless of how it was selected |

**Per ChatGPT's explicit note**: `SELECT_TOPIC` reuse is a *mechanism*
reuse (the same filter-and-fill logic), not a *naming* reuse — the
actual action/reducer case gets its own name at implementation time
(candidates raised: `SELECT_NAVIGATION_TARGET`, `SET_ACTIVE_FILTER`), so
`selectedTopic === 'Politik'` and `selectedTopic === 'Dunia'` don't get
silently conflated under one ambiguous action type. **Not renaming
`SELECT_TOPIC` itself** — that would be a refactor, out of scope for
this fix.

## State transition

```
Current:
  userContext.selectedTopic = 'Politik'   // always a subject value

New:
  userContext.navigationMode = 'subject' | 'geography'
  userContext.selectedTopic  = 'Politik'  // when mode === 'subject' (unchanged meaning)
  userContext.selectedLocation = 'Dunia'  // when mode === 'geography' (new)
```

Kept as two separate fields (`selectedTopic` / `selectedLocation`)
rather than overloading one field for both — per the contract's own
finding that subject and geography are mutually exclusive by
construction, conflating their storage would just move that same
ambiguity into state shape instead of resolving it.

Active Set fill, either mode:

```js
// subject mode (existing, unchanged)
rankedQueue.filter(c => c.topic === selectedTopic)

// geography mode (new, same shape)
rankedQueue.filter(c => c.topic === selectedLocation)
```

## Backward compatibility

- **Existing Bidang selection is fully unaffected.** `navigationMode`
  defaults to `'subject'`; every existing action/state path behaves
  identically to today when in that mode.
- **No existing state shape is removed or renamed.**
  `userContext.selectedTopic` keeps its exact current meaning in subject
  mode.
- **No URL/persisted state exists to break** — confirmed: this project
  has no URL-based routing/deep-linking today (checked: no router
  dependency in `package.json`, no `window.history`/`URLSearchParams`
  usage in `ui/src/`), so there's no external state format to migrate.
- **`en-global`/`ar-global` are structurally unaffected** — the
  geography mode only ever appears for editions where
  `EDITION_GEOGRAPHY_RESIDUAL_LABEL[editionId].local` is non-null, which
  is `ms-MY` only by design (§6 of the contract doc). No conditional
  needs adding elsewhere — an edition without a local geography concept
  simply never offers the mode.

## Test plan (for when implementation happens)

1. Select `Lokasi: Malaysia` → Active Set fills with `field === 'Malaysia'`
   stories (up to capacity), matching the real count already verified
   live (63 stories exist as of 2026-08-13's observatory run)
2. Select `Lokasi: Dunia` → same, against `field === 'Dunia'` (46
   stories)
3. Switch from a geography selection back to a subject Bidang → Active
   Set re-fills correctly under `SELECT_TOPIC`'s existing, unmodified
   path — confirms no shared-state bleed between modes
4. A location with fewer than capacity stories → Active Set shows fewer
   than 10 slots, same graceful-partial behavior the Bidang path already
   has (no force-fill, no error)
5. A location with genuinely zero current stories (hypothetical, not
   true today) → empty state renders "Tiada berita [Lokasi] buat masa
   ini", not the generic message
6. Regression: run full `npm test` (129 assertions) — this feature adds
   a new case, must not perturb any existing subject-mode assertion
7. `en-global`/`ar-global`: confirm the geography mode entry point does
   not render at all (or is inert) — these editions must show zero
   behavior change

## Sequencing recommendation

Per ChatGPT: this is **not** a new feature, it's a fix for content that
already exists but can't be read — the same class of urgency as the
CRITICAL/HIGH items already fixed from the exhaustive audit. Recommended
to implement before Fasa 3 (Editorial Operations MVP), not folded into
it, since it corrects an existing visibility gap rather than adding new
editor-facing capability.

## What this document does NOT do

- Does not implement any of the above — components, state shape, and
  action naming are all still subject to change at actual implementation
  time
- Does not pick the exact UI chrome for the mode switch
- Does not lock the final action-type name
- Does not touch `state/reducer.js`, `state/actions.js`, `state/model.js`,
  or any UI component
