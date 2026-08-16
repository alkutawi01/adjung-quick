# KPM Quarantine — Preflight Evidence Pack v1 (2026-08-16)

Status: `[x] Evidence snapshot` — **no code, no migration, no production change**

FASA 4.2/4.3, per ChatGPT's instruction: `classify-production.js` has
no staging-table path (confirmed by direct code read — `grep staging`
returns zero matches), and per explicit instruction no
`classify-staging.js`, new parameter, or temporary abstraction will be
built just to answer this one question — that would change the
pipeline architecture this project is actively trying to stabilize,
for a one-off experiment. Instead: this document freezes what the
ingestion dry-run already proved, as a precise baseline to compare
against once a real production ingestion + classification cycle runs
(whenever Izzat next authorizes one).

## Why this matters, restated precisely

What is proven right now:

> `rss-kpm` produced 193 items whose `published_at` was fetch-time,
> not a real publish date, and entered the *old* generation. The *new*
> generation (post-quarantine, staged but not swapped) has a real raw
> supply of Nasional/Politik-tagged source content.

What is **not yet proven**:

> Whether that raw supply actually resolves to non-zero
> `ms-MY/Nasional` and `ms-MY/Politik` after classification, once a
> real ingestion + classify cycle runs against live tables.

That second claim is exactly what a future production run will answer
— this document exists so that when it does, the comparison is
against a precise, dated baseline, not memory or a re-derived guess.

## Baseline A — Production, as of this document (unchanged, pre-quarantine data)

| Metric | Value |
|---|---|
| `rss_items` total | 933 |
| `story_clusters` total | 881 |
| Most recent `published_at` | 2026-08-15T10:57:19Z |
| ms-MY / Pendidikan (classified) | 193 |
| ms-MY / Nasional (classified) | 0 |
| ms-MY / Politik (classified) | 0 |
| ms-MY / Bisnes | 59 |
| ms-MY / Sukan | 59 |
| ms-MY / Agama | 42 |
| ms-MY / Hiburan | 37 |
| ms-MY / Gaya Hidup | 25 |
| ms-MY / Jenayah | 25 |
| ms-MY / Dunia | 21 |
| ms-MY / Sains | 5 |
| ms-MY / Teknologi | 2 |
| ms-MY / Bencana | 1 |
| ms-MY / unclassified | 1 |
| `rss-kpm` items present | 193 (all in this generation) |
| Attention V2 production simulation | 19 → 2 (low_confidence only; this dataset still contains KPM's fetch-time-stamped items) |
| `_old` tables | present (`sources_old`, `rss_items_old`, `story_clusters_old`) |

This is the exact state `docs/published-at-source-quality-audit-v1.md`
and `docs/rss-kpm-published-date-resolution-audit-v1.md` were run
against. It remains live and unchanged — no swap has occurred.

## Baseline B — Staging (post-quarantine, dry-run only, never swapped)

Produced by `node db/ingest-production.js --dry-run` after
`rss-kpm` was set to `status: 'disabled'`
(`docs/published-at-integrity-containment-plan-v1.md` Option A,
commit `20daa51`). **This is raw ingestion output — pre-classification.**
Staging tables (`*_staging`) hold this data; production tables are
byte-for-byte unchanged from Baseline A.

| Metric | Value |
|---|---|
| Raw items fetched | 1040, from 40/43 sources |
| `rss-kpm` present | **No** — confirmed absent |
| Clusters staged | 697 |
| RSS items staged | 747 (92 cross-feed duplicates removed) |
| Staging validation | ✓ passed (clusters expected=697/staged=697, items expected=747/staged=747) |

### Raw item counts for Nasional/Politik-relevant sources (staged, unclassified)

| Source | `knownCategory` | Raw items in staging |
|---|---|---|
| `rss-rtm-nasional` | `malaysia` | 50 |
| `rss-awani-nasional` | `malaysia` | 25 |
| `rss-awani-politik` | `politik` | 25 |
| `rss-utusan-politik` | `politik` | 7 |

All four are publisher-declared category feeds (Tier 1 evidence per
`docs/evidence-quality-matrix-contract.md`'s own classification), not
inferred — the same evidence class the classifier already trusts most
highly for other fields.

## What this evidence does and does not establish

**Established**: a real, present supply of Nasional/Politik-tagged raw
content exists in the post-quarantine generation. This was not true by
assumption — it was checked directly against the staged data.

**Not established**: whether `understandStory()` / `classifyForAllEditions()`
(the frozen classification engine, unchanged by this containment work)
actually resolves this raw supply into non-zero `ms-MY/Nasional` and
`ms-MY/Politik` classified rows. Per ChatGPT's explicit caution: do
**not** write "KPM caused Nasional to be empty" as a proven conclusion
— what's proven is narrower: KPM produced 193 fetch-time-stamped items
in the old generation, and the new generation has a real raw supply of
Nasional/Politik content. Whether that supply survives classification
is the specific, still-open question a real production run will
answer.

## What happens to this evidence

- The staging tables (697 clusters / 747 items, KPM-free) are **kept**,
  not cleared — they are the only recoverable copy of this specific
  generation's raw shape.
- `_old` tables are **kept** — no rotation, no drop, no swap.
- No code was written or modified to produce this document — every
  number above was gathered via read-only queries during the ingestion
  dry-run and prior audits, not re-derived by new tooling.

## What this document does NOT do

- Does not run or simulate classification against the staged generation
- Does not modify `classify-production.js`, `ingest-production.js`, or
  any pipeline code
- Does not swap staging into production
- Does not conclude the Nasional/Politik empty-Bidang question — names
  it as open, pending a real production cycle

## Next

Awaiting a real production ingestion + classification cycle, run only
when Izzat next authorizes one (not forced, not simulated). When it
runs, compare its resulting `ms-MY/Nasional`, `ms-MY/Politik`, and
`ms-MY/Pendidikan` counts, plus a fresh Attention V2 production
simulation, directly against Baseline A above — that comparison is
the actual test of the KPM-timestamp hypothesis.
