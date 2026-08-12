# Classification Evidence Model & Schema Design

Status: **DESIGN — awaiting ChatGPT's classification decision audit before any
SQL migration is written or run.** Per instruction: don't migrate Supabase yet,
don't touch UI, don't write 500 keywords.

## Principle: raw evidence and derived interpretation are separate layers

The current code violates this. `lab/rss.js` parses `<category>` and then throws
it away before persistence, so the Tier-2 signal is destroyed at ingestion. And
`story_clusters.topic` conflates *what field this is* with *whether we managed
to classify it at all*.

The fix is a clean split:

```
RSS ITEM
   │
   ├── RAW EVIDENCE            (persisted, never normalized in place)
   │     ├── source
   │     ├── URL
   │     ├── categories[]      <-- currently discarded; P0 to preserve
   │     └── feed identity
   ▼
SIGNAL EXTRACTION
   │     ├── source desk        (derived from URL, at read time)
   │     ├── RSS category
   │     ├── feed-level field
   │     ├── subject candidates
   │     └── geography candidates
   ▼
NORMALIZATION
   │     ├── subject vocabulary
   │     └── geography vocabulary
   ▼
DECISION ENGINE
   │     ├── subject wins
   │     ├── otherwise geography
   │     └── otherwise unclassified
   ▼
CLASSIFICATION RESULT
         ├── field
         ├── status
         ├── method
         ├── rule
         └── confidence
```

Fully deterministic. No AI, no API — per Izzat's locked decision.

**Never overwrite `BERITA` with `Politik` in the raw layer.** That is normalized
interpretation and belongs downstream. Store what the publisher actually sent;
let the classifier decide what matters.

## Result shape

```js
{
  field: 'Politik' | … | null,        // null when unclassified
  status: 'classified' | 'unclassified',
  method: 'source_desk' | 'rss_category' | 'feed_identity'
        | 'content_rule' | 'geography_fallback' | 'none',
  rule: 'utusan.nasional.politik' | null,
  confidence: 0.0–1.0,
  subjectCandidate: 'Politik' | null,   // retained even when geography loses
  geographyCandidate: 'Malaysia' | null,
}
```

Worked examples:

```
field: Politik          field: Malaysia              field: NULL
status: classified      status: classified           status: unclassified
method: source_desk     method: geography_fallback   method: none
rule: utusan.nasional.politik   rule: kosmo.negara    rule: NULL
confidence: 0.98        confidence: 0.71             confidence: 0
```

## Proposed schema changes (NOT YET APPLIED)

### `rss_items` — preserve raw category (P0)

```sql
ALTER TABLE rss_items ADD COLUMN categories TEXT[] NOT NULL DEFAULT '{}';
```

`TEXT[]`, not a single `TEXT`. We must keep everything the publisher sent —
Utusan emits `["BERITA","NASIONAL","Politik","TERKINI"]` and the useful token is
third. Collapsing to `categories[0]` would keep `BERITA` and lose `Politik`.

The URL is already stored in `rss_items.link`, so the desk can be re-derived at
any time; no separate column needed. Raw evidence stays, derived interpretation
is recomputed.

### `story_clusters` — split field from status, add the audit trail

```sql
ALTER TABLE story_clusters
  ADD COLUMN field                     TEXT,           -- NULL when unclassified
  ADD COLUMN classification_status     TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (classification_status IN ('classified','unclassified')),
  ADD COLUMN classification_method     TEXT,
  ADD COLUMN classification_rule       TEXT,
  ADD COLUMN classification_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN subject_candidate         TEXT,
  ADD COLUMN geography_candidate       TEXT,
  ADD CONSTRAINT field_matches_status CHECK (
    (classification_status = 'classified'   AND field IS NOT NULL) OR
    (classification_status = 'unclassified' AND field IS NULL)
  );
```

The existing `topic TEXT NOT NULL DEFAULT 'Unclassified'` column is superseded.
Migration strategy is an open question for the audit — it currently backs
`idx_story_clusters_topic` and is read by the production adapter and the UI, so
it cannot simply be dropped in one step. Proposed: add the new columns, backfill,
switch readers, then drop `topic` in a later migration.

## Confidence must be derived from evidence, not assigned by taste

Indicative weights — **not locked**, to be calibrated against the benchmark
before anything is fixed:

| Evidence | Indicative |
|---|---|
| source desk, exact mapping | 0.90 |
| RSS category, exact mapping | 0.85 |
| feed identity | 0.80 |
| strong phrase match | 0.75 |
| geography only | 0.55 |
| weak keyword match | 0.45 |

The question the benchmark must answer first: *which rules are actually
reliable?* Then calibrate. Bands (`<50` → Unclassified etc.) stay unfixed until
that data exists.

## Benchmark reporting (built: `classification/benchmark.mjs`)

Two metrics, never merged into one "accuracy":

**A. Subject classification** — of stories whose true label is a subject Bidang:
correct / wrong / unclassified.

**B. Residual geography** — of stories whose true label is `Malaysia`/`Dunia`:
correct / unclassified.

Merging them lets `Malaysia` act as a garbage collector that looks impressive.
The harness already reports per-Bidang precision/recall, a confusion matrix,
per-source accuracy, and residual share as a separate line.

## Open questions for the decision audit

1. **`topic` column retirement** — add/backfill/switch/drop across two
   migrations, or one cutover? The UI and `productionAdapter.js` both read
   `topic` today.
2. **Where does classification run?** At ingestion (store the result) or at read
   time (recompute)? Storing makes it auditable and cheap to query but means a
   rule change requires a re-classification pass. Recommendation: store, plus a
   re-classify script — but this interacts with Sesi 3 (Production Ingestion).
3. **Re-classification on rule change** — do we version the ruleset so a story
   records which ruleset version classified it?
