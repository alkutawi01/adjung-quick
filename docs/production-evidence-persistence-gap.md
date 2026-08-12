# Production Evidence Persistence Gap (2026-08-12)

Status: **Bug found, fix in progress — NOT yet re-ingested.** Per
ChatGPT's naming instruction: this is a persistence/pipeline bug, not a
classifier bug, not a taxonomy bug, not a source bug.

## What was wrong

`db/ingest-production.js` never wrote `categories` (raw publisher
`<category>` tags, Tier 3 evidence) or `sourceKnownCategory` (our own
source-registry desk assignment, Tier 1 evidence) into `rss_items`. The
DB column `categories` existed (`db/schema-classification.sql`) but was
never populated — every insert defaulted it to `'{}'`.

Consequence: `db/classify-production.js` reads classification input back
FROM the database, so every production classification run has been
missing Tier 1 and Tier 3 evidence entirely. Only Tier 2 (`url_path`,
derived from `link`, which WAS persisted) survived. Sources whose desk
name isn't encoded in the URL path (MOSTI, KPM, Amanz, Utusan — Agama,
IKIM) got ZERO subject evidence and stayed permanently unclassified —
not because the classification engine is weak, but because it was never
given the evidence it needed.

Confirmed directly: `understandStory()` called live (bypassing the DB)
correctly resolves KPM -> Education@0.9, Amanz -> Technology@0.9,
Utusan Agama -> Religion@0.97, MOSTI -> Science@0.9. The frozen engine
was never the problem.

## Why this matters beyond tonight's new sources

This likely affected EVERY source relying on Tier 1/3 evidence since
production classification began, not just the sources added tonight —
including Kosmo Hiburan, Utusan Ekonomi/Sukan/Politik, RTM's 6 feeds, and
Harian Metro's Bisnes/Arena/Global/Rap feeds. Their apparent classification
"working" (Politik=48, Bisnes=64, etc. in the pre-fix snapshot below) came
from Tier 2 (Astro Awani's URLs literally contain `/berita-politik/` etc.)
— sources without that URL pattern got nothing.

## BEFORE snapshot (recorded here since the live rows no longer exist)

Captured from the classification run reported to ChatGPT earlier
tonight, against the 618-cluster ingestion (before the new Malay sources
were added, before this bug was found):

```
ms-MY, 618 clusters, 437 classified (71%):
  Dunia          98
  Malaysia       94
  Bisnes         64
  Sukan          61
  Politik        48
  Jenayah        37
  Hiburan        24
  Alam Sekitar    4
  Bencana         4
  Sains           2
  Kesihatan       1
```

Note: the live `edition_story_classifications` rows this snapshot came
from no longer exist — `story_clusters` has `ON DELETE CASCADE` to that
table, and a second ingestion (1003 clusters, adding the new Malay
sources) ran before this persistence bug was diagnosed, cascading the old
549 rows away. This document is now the only record of that snapshot.
Lesson applied going forward: snapshot BEFORE re-running ingestion, not
after — `db/ingest-production.js` truncates unconditionally.

## The fix

1. `db/schema-source-known-category.sql` — additive migration, new
   `rss_items.source_known_category` column. Kept SEPARATE from
   `categories[]` deliberately (per ChatGPT): one is publisher-declared,
   the other is our own registry's assignment — different provenance,
   must stay distinguishable, never merged into one field.
2. `db/ingest-production.js` — now writes both `categories` and
   `source_known_category` on every inserted row.
3. `db/classify-production.js` — now reads `source_known_category` back
   and passes it to `understandStory()` as `sourceKnownCategory`.
4. `db/verify-ingestion-persistence.mjs` — new regression check: confirms
   `rss-mosti` rows carry `source_known_category = 'sains'` and
   `rss-utusan-agama` rows carry non-empty `categories[]`. Run after every
   ingestion so this specific failure can't silently recur.

## Sequencing (per ChatGPT, being followed in order)

1. Izzat runs `db/schema-source-known-category.sql` (pending).
2. Sample-10 verification per source (MOSTI/KPM/Amanz/Utusan-Agama) —
   confirm evidence survives the full round trip: RSS -> `rss_items` ->
   `understandStory()` -> a real subject candidate. NOT skipped even
   though the fix already passed a live (non-DB) test — per ChatGPT,
   this is a data-lineage bug, and format mismatches (JSON array vs
   string, column/property name mismatches) only show up once data
   actually round-trips through Postgres.
3. Full re-ingest (1003+ clusters) only after step 2 passes.
4. Re-classify, compare coverage against the BEFORE snapshot above.
5. Document the delta honestly: production pipeline now preserves
   evidence that was previously lost — explicitly NOT "the classifier
   got smarter." Same discipline as `docs/evidence-policy-v1-decision.md`'s
   correction of the "auto-learning" framing.

## Not yet done

- SQL migration not yet run.
- No re-ingestion performed since the fix.
- `docs/production-evidence-lineage.md` (a short source-to-classification
  provenance diagram) requested by ChatGPT, not yet written.
