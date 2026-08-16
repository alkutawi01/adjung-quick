# Taxonomy Stable Field-ID — Design v1 (2026-08-16)

Status: `[x] Design` `[ ] Approved` — **read-only audit + design, no code,
no schema, no migration, no production change**

Per ChatGPT's explicit instruction (2026-08-16, confidence 0.99): this
becomes the FIRST priority, ahead of Filter management UI live-use and
`_old` retirement — "kalau kita bina Filter UI dan daily classification
sebelum identifier Bidang stabil, kita mungkin terpaksa migrate benda
yang sama dua kali." Triggered by Izzat directly: a Bidang/field name
currently has no identity separate from its display label, so renaming
or merging one silently orphans existing data with no error.

## The real gap, named precisely

Every Bidang (`Politik`, `Jenayah`, `Hiburan`, …) is stored, compared,
and displayed as the **exact same literal string**, everywhere. There
is no `id`/`label` split. Renaming `Jenayah` → `Kesalahan & Jenayah`,
or merging `Sains` + `Teknologi` → `Sains & Teknologi`, breaks every
place that string is stored or compared — silently, with no error, no
migration path, no warning.

## 1. Audit — every place a field name is a literal string

Full audit run 2026-08-16 (read-only, no code touched). Organized by
layer.

### 1a. Taxonomy source of truth — TWO independent lists, never verified in sync

This is itself a real, previously-unnoticed bug class:

- **`state/editions.js`** — `taxonomy: ['Nasional', 'Dunia', 'Politik', …]`
  per edition. Its own header comment admits: *"a separate, independent
  copy... the two may diverge, e.g. a field present in classification
  but deliberately not shown in the Wheel."*
- **`classification/lib/edition-taxonomy.mjs`** — `EDITION_TAXONOMY`,
  each entry `{ label: 'Politik', default_mapping: ['Politics'] }`. The
  property is literally named `label` but is used everywhere downstream
  (`resolveDefaultPlacement()`) as the stored/compared value — `label`
  currently doubles as id.

**Nothing enforces these two lists match.** A rename applied to one and
not the other is a silent, undetected divergence today, independent of
whether we ever rename anything — this is a real, already-latent risk.

### 1b. Database storage — plain TEXT, no enum, no FK anywhere

- `edition_story_classifications.field` (`db/schema-edition-classification.sql:42`) — `TEXT`, CHECK constraint only ties `field IS NOT NULL` to `classification_status = 'classified'`, never to a fixed value list.
- `story_clusters.field` (`db/schema-classification.sql:38`, legacy) — same pattern.
- `story_overrides.new_field` (`db/schema-editorial-state.sql:35`) — comment states plainly: *"app layer validates against that edition's own taxonomy, not enforced at DB level."*

No CHECK constraint, enum type, or FK restricts any of these to a known
value anywhere in the schema. **491 `edition_story_classifications`
rows** (current production count) would need a live migration pass on
any rename/merge — not just a code change.

### 1c. Classifier/resolver — three independent vocabularies, all literal strings

- `classification/edition-classification.mjs` — every return path sets `field:` to a raw label (`ruleMatch.display_field`, or a residual/geography label like `'Nasional'`/`'Dunia'`, or `null`).
- `classification/lib/edition-rules.mjs` — hardcodes both a **Universal Subject** literal (`condition: { subject: 'Politics', geographyNot: 'Malaysia' }`) and an **edition-specific display label** literal (`action: { display_field: 'Dunia' }`) in the same rule object — two different vocabularies, both string-literal, in one line.
- `classification/lib/desk-vocabulary.mjs` — `SUBJECT_VOCABULARY`/`GEOGRAPHY_VOCABULARY` are large literal maps from URL/RSS tokens to **Universal Subject** strings (`'Politics'`, `'Crime'`, `'Malaysia'`) — a *third*, English-only, independent vocabulary that `edition-taxonomy.mjs`'s `default_mapping` arrays reference by literal string.

Three vocabularies, three points of potential silent drift: Universal
Subject (English, classifier-internal) → per-edition display label
(`edition-taxonomy.mjs`) → UI taxonomy (`editions.js`).

### 1d. State layer — exact string equality throughout

- `state/reducer.js:100` — `getRankingVersion(editionId, field)` takes the raw field string directly.
- `state/reducer.js:213` — `rankedQueue.filter(c => c.topic === state.userContext.selectedTopic)` — exact `===`.
- `state/reducer.js:234` — ranking-version lookup keyed by the raw field string.
- `state/reducer.js:311-312` — **the sharpest concrete failure mode found**: on `SWITCH_EDITION`, `const fieldSurvives = currentField != null && nextEdition.taxonomy.includes(currentField)`. A renamed field makes `fieldSurvives` false even though editorially it's "the same" field — the user's Wheel selection silently resets to `null` on every edition switch after a rename, with no error.
- `state/editorialStateResolver.mjs:62,79,87` — `field`/`new_field` pass through from raw DB TEXT with no translation layer at all.

### 1e. Ranking config — the exact `'ms-MY.Politik'` composite key

- **`state/rankingFlags.js`** — object literal keyed by field name:
  ```js
  export const RANKING_FLAGS = { 'ms-MY': { Politik: 'editorial_v1' } };
  export function getRankingVersion(editionId, field) {
    return RANKING_FLAGS[editionId]?.[field] ?? 'legacy';
  }
  ```
  Renaming `Politik` silently deactivates `editorial_v1` for that
  field — falls back to `'legacy'`, no error, no warning.
- **`db/daily-observation.mjs:151-156`** builds and persists the exact
  `${edition}.${field}` composite key (`'ms-MY.Politik'`) into snapshot
  rows read back later — a rename orphans historical snapshot data too,
  not just live config.
- **`db/daily-observation.test.mjs`** hardcodes this same key at lines
  36 and 129, plus a `fields: { Politik: 30, ... }` object (line 23).

### 1f. Editorial Filter Rules — confirmed field-blind, no impact today

`db/schema-editorial-filter-rules-v1.sql` has no `field`/`edition_id`
column; `state/editorialFilterResolver.mjs` explicitly states the
filter "decides whether a story is shown, never which field." **V1
filter rules are genuinely global** — confirmed in code, not just
design intent. No rename/merge impact today. `FilterRulesManager.jsx`
mentions per-field scoping only as an unimplemented future comment.

### 1g. Review Queue / admin UI

- `ReviewQueueCard.jsx:52-54` — the reclassify `<select>`'s
  `value={field}` and its displayed option text are the **identical
  literal string** — the canonical "id and label are the same thing"
  instance in the UI layer.
- `reviewQueueAdapter.js:428` — pin's governance-limit check,
  `.eq('new_field', newField)`, is a literal-string equality filter.
  **Concrete failure mode**: during a rename, old pins
  (`new_field = 'Jenayah'`) and new pins
  (`new_field = 'Kesalahan & Jenayah'`) would NOT be counted together —
  silently doubling the "max 2 active pins per field" governance cap
  for that field during any migration window.

### 1h. Reader UI (Wheel / Active Set) — string identity, every hop

Full chain, confirmed end to end: `field` (DB, TEXT) →
`topic` (`productionAdapter.js:193`, same string, just renamed) →
`selectedTopic` (`reducer.js` state) → `===` comparison
(`ActiveSetList.jsx:34`, `reducer.js:213`) → taxonomy-array membership
(`App.jsx:124`, `reducer.js:312`). Every single hop is raw string
identity — nowhere in this chain does an id layer exist today.
`docs/taxonomy-decision-record-v1.md` explicitly validated its own
design on this assumption: *"the existing generic filter
(`c.topic === action.topic`) works unmodified against any taxonomy
value"* — precisely the assumption this design must now revisit.

### 1i. Pin — shares `new_field` with reclassify, same exposure

Pin deliberately reuses the `new_field` column reclassify already has
(`editorialStateResolver.mjs:19-25`, `reviewQueueAdapter.js:381-384`)
rather than a new schema column. Confirmed: any migration must update
`reclassify` and `pin` rows identically — `override_type` is the only
discriminator; both currently store the raw field label in the same
column, with the same governance-limit and Wheel-matching exposure
named in §1e/§1g/§1h.

### 1j. Tests with literal field-name dependence

Would need updating on any rename: `state/pin.test.mjs`,
`state/editorialStateResolver.test.mjs`,
`db/editorial-override-reader-integration.test.mjs`,
`db/production-classification-acceptance.test.mjs`,
`db/snapshot-regression.test.mjs`, `db/daily-observation.test.mjs`.
Confirmed clean (no literal field-name dependence):
`ranking/*.test.mjs`, `db/production-write-guard.test.mjs`,
`db/editor-auth.test.mjs`, `ui/src/admin/editorialAttentionAdapter.test.mjs`,
`state/editorialFilterResolver.test.mjs`.

### 1k. Docs with load-bearing field-name decisions

`docs/taxonomy-decision-record-v1.md` (the Nasional/Dunia ADR — the
doc whose own validation assumption §1h revisits),
`docs/geography-residual-navigation-policy-v1.md`,
`docs/edition-taxonomy-model.md`, `docs/edition-taxonomy-v0.1.md`,
`docs/quick-bidang-taxonomy.md`, `docs/classification-taxonomy-mapping.md`,
`docs/sesi2-edition-taxonomy-design.md`,
`docs/editorial-ranking-activation-policy-v1.md`,
`docs/pin-governance-design-v1.md`, `docs/pin-implementation-design-review-v1.md`,
`docs/empty-bidang-policy.md`, `docs/field-visibility-policy-v1.md`,
`docs/field-visibility-evaluation-v1.md`, `docs/niche-field-coverage-audit.md`,
`docs/taxonomy-audit.md`, `docs/ms-my-taxonomy-review-v1.md`.

## 2. Architecture decision: stable machine-code vs UUID

Per ChatGPT's explicit instruction — do not default to UUID, compare
properly.

| | Stable machine-code (`crime`, `national`, `politics`) | UUID (`7b8e...`) |
|---|---|---|
| **Human-readable in code/DB** | Yes — a developer or admin reading raw data sees `field_id: 'crime'` and understands it immediately | No — opaque, needs a lookup to mean anything |
| **Debuggability** | High — grep-able, appears meaningfully in logs/error messages | Low — every log line needs a join to be useful |
| **Collision risk** | Low for a small, human-curated taxonomy (~16 fields per edition, admin-controlled) | Effectively zero, but irrelevant at this scale — this isn't a high-cardinality user-generated table |
| **Merge-friendliness** | A merge (`Sains` + `Teknologi` → `Sains & Teknologi`) can pick a new sensible code (`science_tech`) or keep one side's code (`science`) — either way it stays legible | A merge still produces an opaque id either way — no readability advantage |
| **Admin UX** | An admin/editor could plausibly read and reason about `field_id` values directly in a future admin screen | Never meaningful to a non-technical admin — always needs a label lookup even for debugging |
| **Precedent in this codebase** | Matches existing patterns: `override_type IN ('hide','pin','reclassify','boost')`, `rule_type IN ('exclude','except')` — every other enum-like column in this project already uses short stable machine codes, never UUIDs | No precedent — every comparable column in this schema uses machine codes |

**Recommendation: stable machine-code identifier, not UUID.** This
taxonomy is small (~16 entries per edition), entirely admin/developer
controlled (never user-generated), and every structurally comparable
column already in this schema (`override_type`, `rule_type`) uses this
exact pattern. A UUID would be conceptually consistent with a
large/dynamic/user-generated table, which this isn't, and would make
every debugging session and every future admin screen strictly worse
for zero real benefit at this scale.

Proposed shape:
```
Field
├── id     ← stable, e.g. 'crime', 'national', 'politics' — never changes once assigned
└── label  ← 'Jenayah', 'Kesalahan & Jenayah', … — freely editable, per edition/locale
```

## 3. Scenarios the design must answer (not just "rename")

| Scenario | What must hold |
|---|---|
| **Rename** (`Jenayah` → `Kesalahan & Jenayah`) | `id: crime` unchanged; only `label` changes; all 491 existing rows, `rankingFlags.js`, pins, filter (if ever field-scoped) keep working with zero data migration — only display-layer lookups need the new label |
| **Merge** (`Sains` + `Teknologi` → `Sains & Teknologi`) | Requires an explicit id-remapping table (`science` → `science_tech`, `technology` → `science_tech`) and a real one-time data migration over existing `field`/`new_field` rows — this is NOT free even with stable ids, must be designed as its own migration step |
| **Split** (one field becomes two) | The inverse of merge — requires either re-classification of existing rows (expensive, needs new evidence) or an explicit admin decision per existing row; no automatic answer, must be named as a manual-effort case, not solved generically |
| **Delete/deprecate** | An id can be marked deprecated (`active: false` on the taxonomy entry) without deleting historical rows — existing classified stories keep their `field_id`, simply stop being offered as a choice for NEW classification/reclassify actions |
| **Alias** (e.g. `kes` added as a second RTM URL-path alias for Crime, done 2026-08-16 in `desk-vocabulary.mjs`) | Aliases are an EVIDENCE-layer concept (multiple tokens mapping to one Universal Subject), already correctly handled today via `SUBJECT_VOCABULARY`'s many-to-one shape — this is NOT the same problem as taxonomy id/label and needs no new mechanism |
| **Ranking activation** (`rankingFlags.js`'s `'ms-MY.Politik'`) | Must key on `field_id` (`'ms-MY.crime'`... or rather `'ms-MY.politics'`), never on the mutable label, so a rename never silently deactivates a ranking pilot |
| **Editorial Filter** (currently field-blind, may want field-scoping later) | If field-scoping is ever added to Filter Rules (not in V1), it must reference `field_id` from day one — never retrofit a label-based column that would repeat this exact problem |
| **Pin's `new_field`** | Must migrate to `new_field_id` alongside reclassify's same column (they share it) — governance-limit queries (`reviewQueueAdapter.js:428`) must compare `field_id`, not label, so a rename never silently doubles the pin cap |
| **Existing 491 `edition_story_classifications` rows** | A live migration pass converting stored labels to stable ids is required — this is real production data work, not a schema-only change, and needs its own careful plan (batch update, verification, rollback) separate from this design doc |

## 4. Two independent taxonomy lists — must be resolved as part of this work

Beyond the rename/merge problem itself, §1a's finding stands on its
own: `state/editions.js` and `classification/lib/edition-taxonomy.mjs`
are two hand-maintained lists that must already match today, with
nothing enforcing it. Whatever the stable-id design becomes, it should
also collapse these into a single source of truth (or add an explicit
consistency check) — otherwise the stable-id refactor itself risks
introducing a THIRD hand-maintained list rather than solving the
duplication.

## What this document does NOT do

- No code written, no schema change, no migration
- Does not implement stable field ids anywhere
- Does not decide the exact id values for existing fields (`crime` vs
  `jenayah` vs something else) — a follow-up implementation document's
  job, once this design is approved
- Does not migrate the 491 existing `edition_story_classifications`
  rows or any `story_overrides.new_field` rows
- Does not touch `rankingFlags.js`, `edition-taxonomy.mjs`,
  `editions.js`, or any consumer listed in §1
- Does not resolve the merge/split scenarios' specific remapping
  tables — named as required future work, not solved here

## Next

Awaiting ChatGPT's review of §2's stable-code-vs-UUID recommendation
and §3's scenario coverage, before any implementation/migration
document is written. Per ChatGPT's stated order: this design →
architecture decision → implementation/migration plan → only then a
new classification generation, Filter UI, and `_old` retirement
resume.
