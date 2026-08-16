# Taxonomy Stable Field-ID — Migration/Implementation Plan v1 (2026-08-16)

Status: `[x] Plan` `[ ] Approved` — **design/plan only, no code, no
schema, no migration executed**

Follow-up to `docs/taxonomy-stable-field-id-design-v1.md` (approved by
ChatGPT, §5 locked as Option C: `subject_code` + `field_code`). Per
ChatGPT's explicit instruction: this is the final architecture
decision for taxonomy V1 — this document plans the migration itself,
still no code written.

## 0. Real production data this plan must handle

Queried directly (read-only), not assumed:

| Edition | Field (current label) | Rows |
|---|---|---|
| ms-MY | Pendidikan | 193 |
| ms-MY | Bisnes | 59 |
| ms-MY | Sukan | 59 |
| ms-MY | Agama | 42 |
| ms-MY | Hiburan | 37 |
| ms-MY | Gaya Hidup | 25 |
| ms-MY | Jenayah | 25 |
| ms-MY | Dunia | 21 |
| ms-MY | Sains | 5 |
| ms-MY | Teknologi | 2 |
| ms-MY | Bencana | 1 |
| en-global | Disaster | 3 |
| en-global | World | 3 |
| en-global | Business | 1 |
| en-global | Politics | 1 |
| en-global | Environment | 1 |
| ar-global | سياسة | 1 |
| ar-global | كوارث | 1 |
| **Total classified** | | **480** |

## 1. Single taxonomy source of truth

Per design doc §7 and ChatGPT's instruction — collapse
`state/editions.js`'s `taxonomy` arrays and
`classification/lib/edition-taxonomy.mjs`'s `EDITION_TAXONOMY` into
ONE table. Proposed shape (design only, not the final column names):

```
edition_taxonomy_fields
├── field_code       TEXT   ← e.g. 'bisnes', 'jenayah', stable, edition-scoped
├── edition_id        TEXT   ← 'ms-MY' | 'en-global' | 'ar-global'
├── label             TEXT   ← 'Bisnes' — the only thing an admin ever edits
├── subject_codes      TEXT[] ← which global subject_code(s) map here, e.g. ['business','economy']
├── display_order      INT    ← replaces the array-position ordering both current lists use
└── active             BOOLEAN
```

`state/editions.js`'s `taxonomy` (UI ordering/list) and
`edition-taxonomy.mjs`'s `EDITION_TAXONOMY` (classifier's resolution
table) become two VIEWS/derivations of this one table, not two
hand-maintained lists. Both current files' existing header comments
about "the two may diverge, e.g. a field present in classification but
deliberately not shown" are preserved via the `active`/visibility
flag, not lost — a field can exist in the source of truth without
being Wheel-visible.

## 2. Stable machine codes — naming pass

Two separate code namespaces, per design doc §5:

- **Global subject codes** (from the Universal Subject vocabulary):
  `politics`, `crime`, `business`, `economy`, `sports`, `environment`,
  `disaster`, `health`, `education`, `technology`, `science`,
  `culture`, `entertainment`, `religion`, `lifestyle` — direct
  lowercase-snake_case of the existing `SUBJECT_VOCABULARY` values.
- **Edition field codes** (what `edition_story_classifications.field`
  will actually store): mostly 1:1 with the global code
  (`jenayah` → `crime`... i.e. `field_code = 'crime'` for ms-MY too,
  since ms-MY doesn't merge Crime with anything) EXCEPT where an
  edition merges multiple subjects — `ms-MY`'s `Bisnes` needs its own
  code distinct from both `business` and `economy`, e.g. `bisnes` (or
  `business_economy` — exact naming is a small follow-up decision, not
  architecturally significant).
- **Geography-residual codes** — `Nasional`/`Dunia`/`World`/`العالم`
  are NOT in `EDITION_TAXONOMY` at all (confirmed: they come from
  `EDITION_GEOGRAPHY_RESIDUAL_LABEL`, a separate residual path with no
  Universal Subject behind them). These need their own `field_code`
  (`nasional`, `dunia`, `world`, ...) with `subject_code = NULL`
  (there is no subject fact to preserve — these stories reach this
  label specifically BECAUSE no subject candidate existed at all).

## 3. Backfill the 480 existing rows — fail-closed, per ChatGPT's explicit guard

**"Kalau satu daripada 491 classification tidak dapat dipetakan dengan
yakin: jangan teka... Migration berhenti dan laporkan row yang
bermasalah."**

Backfilling `field_code` is fully deterministic and unambiguous for
every row — it's a straight reverse lookup from the current stored
label (`'Bisnes'` → `field_code: 'bisnes'`), since every label maps to
exactly one field entry in each edition's taxonomy. **No ambiguity, no
guessing, safe to automate for all 480 rows.**

Backfilling `subject_code` is a genuinely different case, split by
whether the field is a merge target:

- **Non-merged fields** (`Jenayah`↔`crime`, `Politik`↔`politics`,
  `Sukan`↔`sports`, `Agama`↔`religion`, `Hiburan`↔`entertainment`,
  `Gaya Hidup`↔`lifestyle`, `Sains`↔`science`,
  `Teknologi`↔`technology`, `Pendidikan`↔`education`,
  `Bencana`↔`disaster`) — 1:1, fully deterministic, safe to backfill
  automatically for every row in these fields (443 of 480 rows today).
- **Merged fields — genuinely ambiguous, per the fail-closed guard**:
  `ms-MY`'s **Bisnes (59 rows)** merges `business` + `economy` — the
  stored label alone cannot tell us which of the two the original
  classifier candidate actually was; that fact was already discarded
  the moment `resolveDefaultPlacement()` returned only the label,
  before this migration ever runs. **These 59 rows CANNOT be
  confidently backfilled with a real `subject_code` — per ChatGPT's
  explicit instruction, do not guess.** `ar-global`'s equivalent merge
  fields (`اقتصاد`, `صحة وعلوم`) currently have 0 rows in production —
  no live data hits this case there today, but the same rule applies
  if/when they do.
- **Geography-residual rows** (`Dunia`: 21, `World`: 3) — `subject_code
  = NULL` is not a gap here, it's the CORRECT value (§2) — these rows
  never had a subject candidate to preserve.

**Resolution for the 59 ambiguous Bisnes rows**: `subject_code` is set
to a distinct, explicit sentinel — `'unknown_pre_migration'`, never
guessed as `'business'` or `'economy'` — clearly distinguishable from
a genuinely-NULL geography-residual row. `field_code` (fully
unambiguous) still backfills normally to `'bisnes'`, so the story keeps
working everywhere `field_code` is used (reader, ranking, Pin). Only
the FACT-preservation guarantee (§5.3 of the design doc) is honestly
absent for these specific 59 pre-migration rows — future classify runs
populate `subject_code` correctly going forward, this only affects
already-classified history.

## 4. Migration sequencing

1. **Schema** — additive only (matching this project's established
   discipline): add `subject_code`, `field_code` columns to
   `edition_story_classifications`; nullable initially, backfilled in
   step 3, `NOT NULL` only after backfill is verified complete.
2. **Consolidate taxonomy source of truth** (§1) — build the single
   table/source; `state/editions.js` and `edition-taxonomy.mjs` become
   derived views, not separately maintained.
3. **Backfill** (§3) — deterministic `field_code` for all 480 rows;
   `subject_code` for the 443 non-ambiguous rows; explicit
   `'unknown_pre_migration'` sentinel for the 59 ambiguous Bisnes rows;
   `NULL` for the 24 geography-residual rows (21+3, correct by design).
   **Verification gate**: every one of the 480 rows must end this step
   with a non-null `field_code` — if any row fails to resolve, the
   migration halts and reports that row, per the fail-closed guard.
   No partial silent success.
4. **Wire `classify-production.js`** to write both `subject_code` and
   `field_code` on every FUTURE classification run (the function
   already computes both values internally per design doc §5.1 — this
   is exposing what already exists, not new computation).
5. **Migrate consumers to `field_code`**, one at a time, each verified
   independently before the next: `state/reducer.js` (exact-match
   sites), `state/rankingFlags.js` (+ `db/daily-observation.mjs`'s
   persisted snapshot keys), `state/editorialStateResolver.mjs`,
   `ui/src/admin/reviewQueueAdapter.js` (Pin's governance-limit query),
   `ui/src/adapter/productionAdapter.js`, `ui/src/admin/ReviewQueueCard.jsx`.
   Per design doc §5.3, every one of these keeps doing exact-match
   comparison — only the compared value changes from label to code.
6. **`story_overrides.new_field` → `new_field_code`** — same additive/
   backfill/verify discipline as step 1-3, applied to this table
   separately (reclassify + pin rows both use this column).
7. **Regression pass** — full `npm test` plus a live check of reader
   (`/`), admin (Review Queue, Digest, Timeline), and the
   `editorial_v1` ranking pilot specifically (renamed key
   `'ms-MY.politics'`), matching this project's established
   verification discipline for any schema-touching change.

## 5. What stays explicitly out of scope (per ChatGPT)

- **Classification Rules** (admin-editable "URL pattern → field") —
  separate, later feature; this migration only gives it a stable
  `field_code`/`subject_code` to eventually target, doesn't build it.
- **Rename** — confirmed metadata-only (design doc §4); no migration
  step touches classification data for a pure label rename, ever.
- **Merge/split of GLOBAL subject codes** (not an edition's grouping
  choice, but e.g. deciding `science` and `technology` should become
  one universal subject) — a distinct, larger migration than anything
  planned here; not needed for V1, named so it isn't assumed free
  later.
- **Admin visibility of machine codes** — per Izzat's explicit concern,
  `field_code`/`subject_code` never appear in any admin screen; the
  admin experience (type a label, save) is unchanged by this migration.

## What this document does NOT do

- No code written, no schema applied, no migration executed
- Does not finalize exact code strings (`bisnes` vs `business_economy`
  for the merged ms-MY field) — a small naming decision for the
  implementation step, not architecturally significant
- Does not build Classification Rules
- Does not touch global-subject merge/split (§5)
- Does not run any production write

## Next

Awaiting ChatGPT's review before any schema/code work begins. Once
approved, execution follows §4's sequencing, each step verified before
the next — matching this project's established migration discipline
(staging+swap, `_old` lifecycle) rather than a single big-bang change.
