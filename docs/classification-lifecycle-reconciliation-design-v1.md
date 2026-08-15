# Classification Lifecycle Reconciliation — Design v1 (2026-08-15)

Status: `[x] Design` `[x] Approved` — **no code, no migration, no production change**

FASA 4.2 follow-up, per ChatGPT's instruction during the observation
window: staging+swap solved ingestion's *atomicity* problem (a failed
run can never leave production half-updated), but it deliberately did
not solve *consistency* between `story_clusters`/`rss_items` (now
swapped atomically) and `edition_story_classifications` (still written
independently by `classify-production.js`, on its own schedule). This
document answers the questions ChatGPT posed — it does not implement
anything, and it does not touch `story_overrides`.

## The real gap, named precisely

This isn't hypothetical — it's the exact bug the first real swap
attempt hit: `edition_story_classifications` held rows for stories a
previous `classify-production.js` run had classified, which the fresh
`ingest-production.js` run didn't reproduce. Under the old DELETE+INSERT
flow, `ON DELETE CASCADE` (the FK is `story_id TEXT NOT NULL REFERENCES
story_clusters(id) ON DELETE CASCADE`, `db/schema-edition-classification.sql:31`)
silently wiped those rows as a side effect of deleting `story_clusters`.
Staging+swap's `repoint_story_clusters_fks()` now does an explicit
one-time `DELETE ... WHERE story_id NOT IN (...)` to replicate that —
**but only at swap time**. Between swaps, nothing keeps the two in
sync. If classification runs on a schedule independent of ingestion (it
does — they're separate scripts, separate schedules), staleness can
reappear any time a story rolls out of the RSS window before
`classify-production.js` next runs.

## 1. What is the source of truth?

**`story_clusters` is the source of truth for "does this story exist."**
`edition_story_classifications` is explicitly a **projection**, not an
independent fact — it answers "given a story that exists, what field
does it belong to in this edition," and has no meaning for a story
`story_clusters` doesn't currently contain. This isn't a new decision;
it's already implied by the FK (`ON DELETE CASCADE`) and by
`classify-production.js`'s own comment describing its delete+upsert as
correcting for "stale rows [that] can survive a plain upsert." This
document just makes it explicit and traces the consequences.

`rss_items` is one level further downstream — evidence FEEDING the
classifier and the cluster's `representative_rss_item_id`, not itself
classified or referenced by `edition_story_classifications`.

## 2. Lifecycle questions

| Event | What should happen | Why |
|---|---|---|
| **Story disappears from RSS** (rolls out of the fetch window, source stops carrying it) | `story_clusters` row for it is absent after the next ingest+swap. Its `edition_story_classifications` rows become orphaned until the next `classify-production.js` run (or the next swap's cleanup DELETE) removes them. | This is the exact gap named above — currently only closed at swap time, not continuously |
| **Cluster merges** (two `story_clusters` rows collapse into one — not currently possible in this pipeline's clustering model, but worth naming) | Would require both old `story_id`s' classification rows to be considered stale and the merged cluster reclassified fresh — `lab/engine.js`'s clustering is deterministic per-run, so a "merge" today just looks like one of the two IDs not reappearing next run, handled the same as "story disappears" | Named for completeness; not a distinct mechanism this pipeline has today |
| **Cluster splits** (same caveat — not a mechanism the current clustering produces) | Same reasoning in reverse: a split would appear as a new `clusterKey` with no prior classification, handled by the classifier's normal unclassified-until-classified path | Named for completeness, not a distinct mechanism |
| **Classifier changes** (rule/model update in `lab/classify.js`) | Old classification rows for still-existing stories become **stale but not orphaned** — the `story_id` is still valid, the *field* assigned may now be wrong under the new rules. This is a different problem from orphaning: the FK is satisfied, but the content is outdated. | `classify-production.js`'s own delete+upsert already handles this correctly today — a full reclassification run replaces every row. The gap here is narrower: what happens to *classification* between runs, not what happens on a run itself |
| **Taxonomy changes** (an edition's Bidang list changes — a field renamed, split, or removed) | Existing `edition_story_classifications.field` values referencing a removed/renamed field become invalid **at the semantic level**, even though the FK and CHECK constraints are still satisfied (the column is plain `TEXT`, not an enum tied to the taxonomy). No mechanism today would catch this. | Named as a real, currently-undetected risk class — a taxonomy change would need its own reconciliation pass, not covered by anything that exists |

## 3. Distinguishing stale generated classification from real editorial override

This is the boundary this document must NOT blur, per ChatGPT's
explicit instruction not to touch `story_overrides`:

| | `edition_story_classifications` | `story_overrides` (reclassify) |
|---|---|---|
| **What it represents** | The classifier's best automatic guess, as of whenever it last ran | A human editor's deliberate decision, with a `reason`, `created_by`, and `expires_at` |
| **Can go stale** | Yes — silently, just by the classifier not having re-run since the underlying story or taxonomy changed | No — it's a point-in-time human judgment; it doesn't "go stale," it expires (per its own `expires_at`) or gets explicitly undone |
| **Who "corrects" it** | The next `classify-production.js` run, automatically, no human involved | Only another editorial action (undo, or a new override) |
| **Reconciliation implication** | This document's whole subject | Explicitly out of scope — already has its own lifecycle (`docs/editorial-state-implementation-spec-v1.md`, the FASA 3 override system), untouched here |

The practical rule this implies: **any reconciliation mechanism this
design leads to must operate ONLY on `edition_story_classifications`,
never write to or read from `story_overrides` for its own logic.** The
existing precedence order (`editorialStateResolver.mjs`: source disable
\> hide \> pin \> reclassify \> boost \> classifier) already keeps these
separate at read time — reconciliation only needs to keep the
*classifier's own* layer honest, not touch the override layer sitting
above it.

## Open decisions — not resolved here, flagged for approval

1. **Does reconciliation need to be continuous, or is swap-time cleanup
   (what already exists) sufficient?** Today's gap only manifests
   between an ingest+swap and the next `classify-production.js` run —
   if that run always follows shortly after, the window may be
   narrow enough not to matter operationally. Deciding this needs real
   operating cadence data (part of what the observation window itself
   is gathering), not a guess made now.
2. **Should `classify-production.js` itself gain an orphan-cleanup
   step** (mirroring what `repoint_story_clusters_fks()` now does),
   so staleness never depends on swap timing at all? This would make
   the two scripts' write paths more consistent with each other, but
   is a real code change — not proposed for execution here.
3. **Taxonomy-change reconciliation has no mechanism at all today** —
   is that an acceptable known gap (taxonomy changes are rare and
   manually reviewed anyway), or does it need a dedicated pass? Not
   decided here — named so it isn't discovered as a surprise later.

## Proposed V1 Direction (decided by ChatGPT, 2026-08-15)

Resolves the three open questions above. Still design only — nothing
below is implemented by this document.

**1. No continuous reconciliation service.** Rejected explicitly: a
background daemon/cron that keeps checking consistency would itself be
"one more system that needs to be trusted" — exactly the kind of
always-on surface this project has been deliberately narrowing, not
widening. Instead: **projection consistency is enforced at pipeline
execution boundaries.** Two boundaries exist today, and each owns its
own consistency:
- **Ingestion boundary** — staging+swap's job is to keep `story_clusters`/
  `rss_items` identity stable and atomic. Already built.
- **Classification boundary** — `classify-production.js`'s job is to
  leave `edition_story_classifications` clean *relative to whatever
  `story_clusters` currently contains* every time it runs. Not yet built
  (see #2).

**2. Classification pipeline owns classification cleanup — yes.**
Confirmed as the right owner, not ingestion. The bug this whole
document traces (`ingestion succeeds → story_clusters changes →
old classification rows survive`) exists because `classify-production.js`
implicitly assumes "the classification world is already clean" rather
than actively making it so. Its contract should be stated explicitly:

> After `classify-production.js` completes, `edition_story_classifications`
> represents the current state of `story_clusters` — nothing more, nothing
> less.

Concretely (design only, not built here): before or as part of writing
new classifications, remove rows whose `story_id` has no corresponding
active `story_clusters` row — or, more robustly, rebuild the projection
atomically each run (mirroring the same staging+swap discipline
ingestion already uses, applied to this table instead). Which of those
two shapes is the actual right one is *implementation* detail for the
next document, not decided here.

**3. Taxonomy-change reconciliation — not ignored. Named as an
official FASA 4.2.2 gap.** This is larger than it first looks:
`edition_story_classifications.field` is plain `TEXT`, not tied to any
canonical taxonomy list — the database has no way to know `"Malaysia"`
is a deprecated field name once an edition's taxonomy renames it to
`"Nasional"`. Nothing breaks technically (FK/CHECK constraints are
still satisfied), but a reader could be served a category that no
longer semantically exists. **Decision: taxonomy changes require an
explicit migration plan — never a bare relabeling.** Recorded as a
named future gap (FASA 4.2.2), not solved now.

## What this document does NOT do

- No code written, no migration, no schema change
- No change to `story_overrides` or its lifecycle
- No change to `classify-production.js` or `ingest-production.js`
- Does not decide any of the three open questions above
- Does not propose the Old Table Lifecycle Policy v2 or Retention
  Policy documents — those are separate, next in ChatGPT's stated order

## Next

Approved. Old Table Lifecycle Policy v2 is next, per ChatGPT's own
reasoning: Old Table Lifecycle answers "how long do we keep the old
generation," but Classification Lifecycle answers the more basic
question "is the new generation itself trustworthy" — the second has
to be settled first.
