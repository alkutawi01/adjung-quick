# Reclassify Action Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] plan. No implementation here.** FASA 3.6.3b. Per
ChatGPT's explicit 5-point brief, answered below before touching code.
Same discipline as 3.6.3a: don't touch classifier rules, ranking
algorithm, or taxonomy.

## 1. Reclassify is story-level only

Confirmed scope — a single `story_overrides` row, one `story_id` +
`edition_id` pair. No batch/bulk reclassify, no source-level rule. This
is already how the schema and `resolveStoryField()` are shaped; nothing
new needed here, just confirming the boundary holds.

## 2. What gets stored

Already true, from 3.6.1's schema — confirmed against
`db/schema-editorial-state.sql`, not new work:

| Field | Column | Note |
|---|---|---|
| Original classifier output | `edition_story_classifications.field` | Never overwritten — reclassify writes a SEPARATE `story_overrides` row; `resolveStoryField()` reads both and the override wins, but the classifier's own row is untouched. This is the same "Generated Data ≠ Editorial State" invariant the whole schema was built around. |
| Editor decision | `story_overrides.new_field` | The chosen Bidang |
| Reason | `story_overrides.reason` | `NOT NULL` at the DB level |
| Editor identity | `story_overrides.created_by` | FK to `editors.user_id` |

Nothing to add — the schema already satisfies this. Confirmed by
reading, not assumed.

## 3. Behaviour — answered by reading the actual code, not designed fresh

**Active Set, original Bidang.** If a story is already sitting in a
reader's in-memory Active Set when an admin reclassifies it, it does
**not** disappear live — there is no realtime push/subscription
anywhere in this app (confirmed: `productionAdapter.js` is a plain
fetch, no `supabase.channel()` usage anywhere in the codebase). It
disappears on the next rebuild trigger — `SELECT_TOPIC`,
`SWITCH_EDITION`, or a fresh page load — exactly the same behaviour
Hide already has and Test 2 already proves (`db/editorial-override-
reader-integration.test.mjs`: "recomputing... still hidden"). Reclassify
doesn't need new plumbing here; it inherits the same fetch-time
resolution Hide already uses.

**Active Set, new Bidang.** Once fetched fresh, the story is eligible
under its new `topic` like any other story in that Bidang — same
`selectActiveSet()` path, no special-casing.

**Edition switch.** `story_overrides.edition_id` scopes the override —
`fetchRankedQueue(editionId)` only fetches overrides `WHERE edition_id
= editionId` (already the query shape from 3.6.3a). A ms-MY reclassify
has zero effect on en-global's or ar-global's placement of the same
cluster — matches the Edition Architecture's existing principle (same
story, different editorial home per edition) already established for
the classifier itself.

**Ranking after reclassify.** `editorialScore` comes from
`story_clusters.editorial_score` — completely independent of `topic` in
`mapRowsToRankedQueue()`. Reclassify changes WHICH Bidang pool a story
competes in; it does not, and per "jangan sentuh ranking algorithm"
must not, change the score it competes WITH. A reclassified story
carries its original score into its new Bidang. This is a direct
consequence of not touching the ranking algorithm, not a new design
choice.

## 4. Precedence — already verified, not new work

`hide > reclassify` is already the first thing
`state/editorialStateResolver.test.mjs` proves ("hide beats reclassify,
even if reclassify is present too") — `resolveStoryField()` checks hide
before it ever looks at reclassify. Reused unchanged by 3.6.3a's
resolver integration. Nothing to add for 3.6.3b.

## 5. UI language

Per ChatGPT: never "Override classification" — use **"Letakkan berita
ini di bidang lain"** (place this story in another Bidang). Current
`ReviewQueueCard.jsx` already avoids the forbidden phrase (button says
"Ubah bidang"), but doesn't yet show ChatGPT's exact mandated sentence
anywhere. Implementation will add it as the reclassify compose flow's
confirm line — the same pattern Hide already has ("Berita ini tidak
akan muncul kepada pembaca."), so both actions read consistently.

## Editorial action standard (per ChatGPT, applies going forward)

Every editorial action needs: **Decision + Reason + Actor + Reversible**.
Hide already satisfies all four. Reclassify must too:
- Decision — `override_type: 'reclassify'`, `new_field`
- Reason — `story_overrides.reason`, required
- Actor — `story_overrides.created_by`
- Reversible — `deactivateOverride()` (already built in 3.6.3a,
  reused as-is — reclassify undoes the same way hide does: deactivate
  the row, story falls back to its classifier field)

## What this plan does NOT do

- Does not implement the UI change (confirm sentence, any picker
  adjustments)
- Does not touch classifier rules, ranking algorithm, or taxonomy
- Does not add realtime/live-push Active Set updates — reclassify (like
  hide) takes effect on next fetch, not instantly for an already-open
  reader session, consistent with this app's existing architecture

## Next

Implementation: add the confirm sentence to `ReviewQueueCard.jsx`'s
reclassify compose flow, add reclassify-specific test coverage
alongside the existing hide tests, verify live, report before closing
3.6.3b.
