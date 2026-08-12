# Production Evidence Lineage (2026-08-12)

Status: **Reference document.** A short provenance map of how one piece
of evidence travels from an RSS feed to an Edition placement — written
after `docs/production-evidence-persistence-gap.md` found that this path
had a silent gap for months. This document exists so a future audit can
check "is data flowing correctly at every layer" without re-deriving the
pipeline from scratch.

## The path

```
Source Registry (lab/sources.js)
        │
        │  knownCategory: "sains"  (WE assign this, per feed URL)
        ▼
RSS Fetch (lab/rss.js — fetchFeed)
        │
        │  categories: [...]        (PUBLISHER declares this, <category> tags)
        │  sourceKnownCategory      (carried through from source.knownCategory)
        ▼
Ingestion (db/ingest-production.js)
        │
        │  writes to rss_items:
        │    categories             (Tier 3 evidence)
        │    source_known_category  (Tier 1 evidence)
        ▼
Classification input (db/classify-production.js)
        │
        │  reads rss_items back, passes to understandStory():
        │    categories
        │    sourceKnownCategory  <- FROM source_known_category column
        ▼
Story Understanding (classification/story-understanding.mjs — FROZEN)
        │
        │  produces subject_candidates[] with evidence trail
        ▼
Edition Classification (classification/edition-classification.mjs — FROZEN)
        │
        │  resolves ONE field per edition per story
        ▼
edition_story_classifications (production table)
        │
        ▼
productionAdapter.js -> Wheel / Active Set (UI)
```

## Risk table — where this can break, and how each was found

| Layer | Critical data | Risk if lost | Status (2026-08-12) |
|---|---|---|---|
| RSS Fetch | XML `<category>` | Publisher doesn't send one | Normal — not every story has one, handled as absent evidence |
| Ingestion | `categories[]`, `source_known_category` | Persistence bug (silently dropped) | **Was broken, now fixed** — `docs/production-evidence-persistence-gap.md` |
| Classification input | `sourceKnownCategory` passed through | Adapter forgets to pass it | **Was broken, now fixed** — same incident |
| Edition Resolver | Placement rule | Rule/taxonomy issue | Covered by the Batch A/M/U/Medium calibration arc, `docs/evidence-policy-v1-decision.md` |

The Ingestion and Classification-input rows are the ones that just broke
— they're the two layers with no existing test coverage before tonight.
`db/verify-ingestion-persistence.mjs` now checks the Ingestion row
specifically (does `source_known_category` survive into the DB).

## Before treating any pipeline change as "production ready"

Per ChatGPT: this table is the checklist. A change to sources, schema, or
the ingestion/classification scripts should be able to answer, for each
row: does the data survive this layer, and how do we know (which test or
manual check confirms it)?

## Known technical debt (recorded, not actioned)

`db/ingest-production.js` truncates `rss_items`/`story_clusters`/`sources`
unconditionally before every run (`.delete().not('id', 'is', null)`).
Acceptable for development-stage verification, where re-deriving
everything from RSS each time is the point. Per ChatGPT: for a more mature
production stage, this should move to upsert + archive/versioning, since
historical data has real value for future calibration rounds
(`docs/calibration-ready-engine.md`). Not being changed now — noted here
so it isn't forgotten, not scheduled.
