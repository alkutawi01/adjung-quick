# Production Classification Acceptance Test (2026-08-12)

Status: **Structural guard in place. Real-data validation still pending
the SQL migration.**

## Why this exists

After `docs/production-evidence-persistence-gap.md`, ChatGPT flagged a
second, distinct risk — not a bug that exists today, but one that's easy
to introduce later: a future developer sees `cluster.topic` on a row,
assumes it's a live category, and wires new UI against
`story_clusters.topic` (the OLD classifier's Politics/Economy/Sports/World
vocabulary — zero overlap with any edition's real taxonomy) instead of the
edition-specific placement in `edition_story_classifications`. That
mistake would run without error and just show wrong data — worse than a
crash, because nothing signals it happened.

## Three distinct fields — don't conflate them

- **`topic`** — the UI placement field. Comes from
  `edition_story_classifications.field` for the currently active edition.
  This is the only one the Wheel/Active Set should ever read.
- **`legacyTopic`** — `story_clusters.topic`, the OLD classifier's output.
  Kept on the object for audit/debugging only. Never used for placement.
  Candidate for removal once the new path is proven in production (per
  `db/schema-edition-classification.sql`'s own note).
- **`subject_candidate`** — internal to the classification engine
  (`classification/story-understanding.mjs`), one layer further upstream
  than either of the above. Not something the UI or adapter ever touches
  directly — it's evidence, not a placement.

## What was built

`ui/src/adapter/productionAdapter.js`'s reshape logic was split into a
pure `mapRowsToRankedQueue()` function, testable without a live Supabase
call. `db/production-classification-acceptance.test.mjs` runs it against
mocked rows shaped like ChatGPT's example table (Malaysia politics /
Thailand politics / Science) across `ms-MY`/`en-global`/`ar-global`, and
asserts:

- each edition's `topic` matches that edition's own placement
- `topic` never silently falls back to `legacyTopic`
- `legacyTopic` stays present, but separate
- the sharpest case — Thailand politics files under `Dunia` in `ms-MY` but
  `Politics` in `en-global` — resolves correctly, proving the Edition
  Architecture is actually working, not just structurally present

16/16 passing. `vite build` verified to still succeed after the refactor.

## What this is NOT

This is a **mock/structural** test — a regression guard against the
field-conflation mistake described above. It is not the **Real
Classification Snapshot Test** ChatGPT described as the next step: taking
20 real production stories, recording their ms-MY/en-global/ar-global
placement as a snapshot, and diffing future classification-engine runs
against that snapshot to answer "what changed, and why" — useful once
Adjung Quick is calibrating against real traffic, not before.

## Sequencing (unchanged from the persistence-gap doc)

Migration → sample verification → full re-ingestion → full classification
→ **Real Acceptance Test** (the production-data version of this doc). That
last step is the checkpoint ChatGPT named as deciding whether Adjung Quick
has moved from "lab" to "production system."

## Layer status (per ChatGPT, 2026-08-12)

| Layer | Status |
|---|---|
| 1 — Source Intelligence | done |
| 2 — Evidence Persistence | migration pending |
| 3 — Classification (frozen engine) | done |
| 4 — Edition Placement | test structure passing |
| 5 — UI Consumption (adapter) | audit passing |
| 6 — Real Production Validation | pending re-ingestion |
