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

## Decisions from ChatGPT's audit (2026-08-12) — migration APPROVED

1. **`topic` retirement — two stages, confirmed.** Add the new columns now, keep
   `topic` and its index. Do **not** blind-backfill `topic → field`: the old
   values came from the classifier we're replacing, so backfilling would import
   its mistakes as ground truth. Drop order: new schema → classifier → benchmark
   + editorial labels → classify corpus → verify → switch adapter/UI → regression
   → drop `topic`. (0.99)
2. **Classify at ingestion, store the result — LOCKED.** Not at read time. A
   `classification/reclassify.mjs` pass handles ruleset changes. Build it now,
   don't wait for Sesi 3. (0.97)
3. **Classify the Story Cluster, not the RSS item.** Clustering decides what
   counts as one story; classification decides its Bidang. The two engines stay
   separate and classification must never alter clustering. (0.97)
4. **Evidence may come from any member of the cluster**, not just the canonical
   item — one cluster might have Utusan `category=Politik` + Astro Awani
   `/berita-politik/` + BBC `category=News`. Don't lock the architecture to
   "canonical item is the only evidence source". Aggregation weighting is
   deliberately **not** designed yet. (0.93)
5. **Ruleset versioning — mandatory.** Added `classification_ruleset_version`,
   nullable (pre-v1 rows genuinely have none). Recorded even for unclassified
   rows, because "unclassified" is a *result* of a ruleset, not an absence of
   one. Never use `updated_at` as a substitute — that's lifecycle, not
   provenance. (0.99)
6. **Precision over coverage — LOCKED.** The goal is never "eliminate
   Unclassified". `field=NULL, status=unclassified` beats
   `field=Politik, confidence=0.31` that is wrong but looks complete. (0.99)

### Benchmark: three layers + a holdout (0.98)

ChatGPT agreed the circularity concern is real: labelling 191 items, writing
keywords from those labels, then testing on the same items is self-assessment,
not measurement.

- **Layer 1 — Claude drafts** all 191: `draft_field`, `draft_confidence`,
  `uncertain`, `reason`.
- **Layer 2 — Izzat adjudicates.** Not all 191 at equal effort: Claude flags
  high-confidence / low-confidence / boundary, Izzat focuses on boundary cases
  and spot-checks the rest.
- **Layer 3 — freeze** as ground truth.
- **Dev/holdout split decided BEFORE rules are written** (~130 dev / ~61
  holdout). Rules are authored against the development set only; the holdout is
  untouched until ruleset v1 is considered finished.

### Session breakdown

| Step | Work |
|---|---|
| 1A | Schema migration (this file) |
| 1B | Corpus labelling: Claude draft → Izzat adjudicate → freeze |
| 1C | Ruleset architecture: desk → category → feed identity → content → geography |
| 1D | Classifier v1, deterministic only |
| 1E | Holdout benchmark: precision/recall/confusion/per-source/residual |
| 1F | Ruleset revision from failure analysis only |
| 1G | Production integration |

UI work resumes only after all of the above passes.

## LOCKED — classification is language-independent (2026-08-12)

Real collision surfaced while labelling the benchmark: Izzat's answer to
"should Politik be global or Malaysia-only" was *"kalau pembaca pilih bahasa
Melayu, maka politik malaysia sahaja. jika pilih bahasa lain, maka sejagat"* —
which implied the same story could carry a different Bidang depending on
reader language. That collides directly with locked O-012 ("one Active Set,
never one per language").

ChatGPT's resolution (confidence 0.96): Izzat is describing **editorial
relevance**, not classification. Two different questions were being
conflated — *what is this story about* (Subject) vs *is this story relevant to
this reader* (Scope/Context). Fix:

- **`field` stays ONE value per Story Cluster, language-independent.** Politik
  is a global subject — Lebanon's parliament, NZ's PM, Malaysia's PRU are all
  `Politik`. Forcing Politik to mean "Malaysia only" breaks the Bidang's
  semantics and turns every foreign political story into `Dunia`, when `Dunia`
  is a geography bucket, not a subject.
- **`Malaysia`/`Dunia` remain pure residual** — assigned only when *no subject*
  matches. A political story about any country is still `Politik`; it never
  falls to `Malaysia`/`Dunia`, per the already-locked subject-beats-geography
  rule. This was the existing design; the only real question was whether
  Politik itself was Malaysia-scoped, and it is not.
- **Reader-language relevance is a future presentation-layer concern** —
  named "Reader Scope Resolver" / "Editorial Context Filter", explicitly NOT
  built yet, explicitly NOT part of classification. It would read
  `field` + `geography_candidate` + the reader's language/region context to
  decide what the *wheel* shows — e.g. a Malay-context wheel might
  deprioritize non-Malaysian `Politik` stories — without ever changing the
  stored classification. Story identity stays singular; language selects
  representation, never re-classifies the story (same principle as O-012).
- **`geography_candidate` should hold real granularity**, not just a
  `Malaysia`/`Dunia` binary — actual country/region (`Lebanon`, `New Zealand`,
  `Malaysia`) so a future relevance layer has something to filter on. No schema
  change needed (`TEXT`, already flexible); this only affects what values get
  written into it.

**Practical effect on labelling:** no rework needed. Label `field` as the true
global subject; `Malaysia`/`Dunia` only for stories with no subject match at
all — exactly the rule already in use.

## Remaining open question

1. **`topic` column retirement** — add/backfill/switch/drop across two
   migrations, or one cutover? The UI and `productionAdapter.js` both read
   `topic` today.
2. **Where does classification run?** At ingestion (store the result) or at read
   time (recompute)? Storing makes it auditable and cheap to query but means a
   rule change requires a re-classification pass. Recommendation: store, plus a
   re-classify script — but this interacts with Sesi 3 (Production Ingestion).
3. **Re-classification on rule change** — do we version the ruleset so a story
   records which ruleset version classified it?
