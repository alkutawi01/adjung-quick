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

## 3. Taxonomy vs Classification Rule — two separate concepts, per ChatGPT's explicit correction

**Locked distinction, must not be blurred:**

```
Taxonomy               "What Bidang/fields EXIST?"
  crime → Jenayah

Classification Rule    "WHEN should a story get that field?"
  /jenayah/ → crime
```

This design (`taxonomy-stable-field-id-design-v1.md`) answers only the
first question. The second — an admin-editable "URL pattern → field"
rule, the mechanism Izzat independently proposed ("`/mutakhir/` = kod
A, kod A = label Umum") and that matches ChatGPT's earlier-sketched
"Classification Rules" family — is a **separate, later feature**, not
part of this migration. Mixing them here would let migration scope
expand indefinitely. `desk-vocabulary.mjs`'s `SUBJECT_VOCABULARY`
remains the (currently hardcoded, not admin-editable) mechanism that
answers the second question today — this design does not change that,
only gives its OUTPUT (a Universal Subject / field) a stable identity
to land on.

## 4. Rename vs Merge vs Split — different classes of change, not one "taxonomy edit" operation

**Rename — metadata-only, zero data migration:**
```
politics → politics   (id unchanged)
label: Politik → Politik & Kerajaan
```
No `edition_story_classifications` row is touched. Every consumer
that stores/compares `field_code` keeps working unmodified — only
display-layer label lookups change.

**Merge — genuine data migration, requires an explicit remapping:**
```
science
technology
       ↓
science_technology
```
Existing rows carrying the old ids must be rewritten to the new id.
This is real production data work (batch update + verification +
rollback plan), not a metadata edit, even with stable ids in place.

**Split — cannot be automated, requires an explicit editorial decision per row:**
```
science
   ↓
science
environment
```
The system has no way to know which existing "science" stories should
become "environment" — there is no automatic answer. A split must be
named as a manual-effort case requiring a human (editor) decision per
affected story, or a one-time re-classification pass with new evidence
— never a silent/automatic remap.

**Design implication:** the migration/implementation document (next
step, not this one) must clearly separate two kinds of change:
**taxonomy metadata change** (rename — safe, cheap, no data touched)
vs **classification data migration** (merge/split — real production
data work, needs its own plan, checklist, and rollback path, same
discipline this project already applies to `_old`/ingestion swaps).

## 5. Global Field Identity vs Edition Taxonomy Mapping

**Admin-facing note, per Izzat's explicit concern (2026-08-16): none of
§5's internal complexity (`field_code`, `subject_code`, the mapping
table) is ever surfaced to an admin.** An editor's actual experience —
typing a new Bidang label and saving, or managing Editorial Filter
Rules — stays exactly as simple as it is today, before and after this
migration. `field_code`/`subject_code` are internal plumbing, the same
category as a database row id — never shown in any admin screen, never
something an editor types or needs to understand. The entire point of
this work is to make an admin's future maintenance SAFER (renaming a
Bidang currently risks silently losing stories; after this, it won't),
not to add a concept an admin has to learn.

**Revised 2026-08-16 per ChatGPT's second review — this is the
decision the whole design has been building toward, audited directly
against the resolution code (not assumed).**

### 5.1 How the merge actually happens today — confirmed in code

`classification/lib/edition-taxonomy.mjs:113-117`:
```js
export function resolveDefaultPlacement(edition, universalSubject) {
  const table = EDITION_TAXONOMY[edition] ?? [];
  const entry = table.find(e => e.default_mapping.includes(universalSubject));
  return entry?.label ?? null;
}
```
This function takes exactly ONE Universal Subject value (a story's top
`subject_candidates` entry — `'Business'` OR `'Economy'`, never both at
once for one story) and resolves it to ONE edition-specific label. The
merge (`ms-MY`'s `Bisnes` accepting both `'Business'` and `'Economy'`)
happens entirely inside this lookup — `default_mapping.includes(...)`
matching either value to the same `entry.label`. **The true
classification fact — which Universal Subject the story actually
matched — already exists as a distinct value in the pipeline before
this function collapses it.** Today that fact is thrown away the
moment `resolveDefaultPlacement()` returns; only the collapsed label
(`'Bisnes'`) is what gets stored in `edition_story_classifications.field`.

### 5.2 Three-layer model, confirmed compatible with existing code shape

```
Global Field                  ← the Universal Subject, formalized as a stable code
  business
  economy
  crime
  politics
       ↓
Edition Taxonomy Mapping       ← EDITION_TAXONOMY, already exists, just needs codes not labels
  ms-MY:      business + economy → field_code 'bisnes', label "Bisnes"
  en-global:  business           → field_code 'business', label "Business"
              economy            → field_code 'economy',  label "Economy"
       ↓
edition_story_classifications  ← what actually gets stored, per story per edition
```

`resolveDefaultPlacement()` becomes the function that performs exactly
this lookup already — it just needs to return a stable `field_code`
(`'bisnes'`) instead of a display `label` (`'Bisnes'`), and the design
needs to decide what ELSE gets stored alongside it (§5.3).

### 5.3 What should `edition_story_classifications` actually store — audited both options

**Option A — store the edition-resolved `field_code` only** (e.g.
`'bisnes'` for an ms-MY Business-or-Economy story):
- Zero change to every downstream consumer's *shape* — `reducer.js`'s
  `===` comparisons (§1d/§1h), `rankingFlags.js`'s keying (§1e), Pin's
  governance-limit `.eq()` (§1g) all keep working exactly as they do
  today, just comparing a stable code instead of a mutable label.
- **Loses the classification fact** — whether the story specifically
  matched `Business` or `Economy` is gone the moment it's stored. This
  is the loss ChatGPT flagged: *"itu menjaga fakta klasifikasi daripada
  presentation taxonomy"* — Option A does NOT preserve that fact.

**Option B — store the global Universal Subject code only** (e.g.
`'business'` or `'economy'`, never the merged `'bisnes'`):
- Preserves the classification fact exactly, per ChatGPT's stated
  preference.
- **Real, non-trivial cost**: every downstream consumer that currently
  does exact-match comparison (`c.topic === selectedTopic` in
  `ActiveSetList.jsx:34`/`reducer.js:213`, `taxonomy.includes(field)`
  in `reducer.js:312`, `rankingFlags.js`'s single-key lookup, Pin's
  `.eq('new_field', ...)`) would need to become a GROUP-membership
  check instead — "does this story's global code belong to the set of
  codes ms-MY groups under the currently selected Bidang?" — a real
  logic rewrite at every one of those sites, not a data-only change.

**Option C — store BOTH, recommended**: a `subject_code` column (the
raw global Universal Subject fact, e.g. `'business'`) AND a
`field_code` column (the edition-resolved, already-grouped display
code, e.g. `'bisnes'`), both written once at classification time via
`resolveDefaultPlacement()`'s lookup (which already has both values
available in the same function call — no extra computation, just
return both instead of only the label). This:
- Preserves the classification fact (`subject_code`) exactly, per
  ChatGPT's stated priority — nothing is thrown away.
- Keeps every existing downstream consumer's matching logic AS
  EXACT-MATCH, unchanged in shape (`reducer.js`, `rankingFlags.js`,
  Pin's governance query all key off `field_code`, same as Option A) —
  no group-membership rewrite needed anywhere.
- Costs one extra TEXT column and one extra value returned from an
  already-existing function call — the cheapest of the three for the
  fact-preservation guarantee it buys.

**Worked example (ms-MY, the real locked-merge case):**

| Story | Universal Subject (evidence fact) | `subject_code` (stored) | `field_code` (stored) | Bidang shown |
|---|---|---|---|---|
| "Bank Negara umum kadar faedah" | `Business` | `business` | `bisnes` | Bisnes |
| "Ringgit susut nilai" | `Economy` | `economy` | `bisnes` | Bisnes |

Both stories correctly land under the same displayed Bidang
(`field_code: 'bisnes'`, matching every existing exact-match consumer
unchanged) while the underlying fact — which one was actually
`Business` vs `Economy` — survives in `subject_code`, available for
any future need (audit, re-derivation if an edition's grouping choice
changes later, or a future admin screen showing the raw evidence).

**Recommendation: Option C.** It satisfies ChatGPT's explicit priority
(preserve the classification fact) without requiring the group-
membership rewrite Option B would force across `reducer.js`,
`rankingFlags.js`, and Pin's governance query — real, avoidable scope.

### 5.4 Answering the specific audit questions ChatGPT asked

- **ms-MY Business + Economy → Bisnes**: §5.3's worked example, above.
- **en-global Business ≠ Economy**: both keep their own `field_code`
  (`'business'`, `'economy'`) — `EDITION_TAXONOMY['en-global']`'s
  existing 1:1 entries already express this; no change needed to that
  table's *shape*, only label→code formalization.
- **Arabic's own mapping** (`اقتصاد` merging `Business`+`Economy`, and
  `صحة وعلوم` merging `Health`+`Science`) — same Option C mechanism:
  both stories get `field_code: 'iqtisad'` (or similar) regardless of
  which Universal Subject they matched, `subject_code` preserves which.
- **Rename without data migration**: unaffected by this layer —
  renaming a `label` in `EDITION_TAXONOMY` never touches `field_code`
  or `subject_code`, exactly §4's rename guarantee, still holds.
- **Genuine merge of two global fields into one universal field**
  (e.g. if `science` and `technology` were ever merged at the GLOBAL
  layer, not just within one edition's grouping) — this is different
  from an edition's grouping choice (§5.2's layer 2) and would be a
  real `subject_code` migration (per §4's Merge case) across ALL
  editions' stored rows, not just one edition's mapping table.
- **Split of one universal field into two** — same as §4's Split case,
  applies at the `subject_code` layer, still cannot be automated.
- **`rankingFlags.js`'s `ms-MY.Politik`**: becomes `'ms-MY.politics'`,
  keyed on `field_code` (Option C) — unaffected by the subject/field
  split, since ranking activation is a presentation-layer (per
  displayed Bidang) concern, correctly modeled on `field_code`.
- **`story_overrides.new_field`**: becomes `new_field_code`, storing
  the edition-resolved code (an editor reclassifying a story picks a
  DISPLAYED Bidang from that edition's taxonomy, not a raw global
  subject) — `subject_code` has no equivalent for a human override,
  since a human decision IS the edition-level fact, not raw evidence.
- **`edition_story_classifications`**: gains both columns per §5.3.
- **Review Queue / reader / reducer**: all continue to key on
  `field_code` only, per Option C's whole point — zero logic-shape
  change beyond swapping label-string comparisons for code-string
  comparisons.

**This is now locked as the recommended model, pending ChatGPT's
final confirmation** — §5.1-5.4 replace the earlier open question.

## 6. Scenarios the design must answer

| Scenario | What must hold |
|---|---|
| **Rename** (`Jenayah` → `Kesalahan & Jenayah`) | Metadata-only per §4 — `field_code: crime` unchanged; only `label` changes; all 491 existing rows, `rankingFlags.js`, pins, filter (if ever field-scoped) keep working with zero data migration |
| **Merge** (`Sains` + `Teknologi` → `Sains & Teknologi`) | Real data migration per §4 — explicit id-remapping table (`science` → `science_tech`, `technology` → `science_tech`) and a one-time migration pass over existing `field`/`new_field` rows |
| **Split** (one field becomes two) | Cannot be automated per §4 — explicit editorial decision or re-classification pass required, never a silent remap |
| **Delete/deprecate** | A `field_code` can be marked deprecated (`active: false`) without deleting historical rows — existing classified stories keep their `field_code`, simply stop being offered as a choice for NEW classification/reclassify actions |
| **Alias** | An EVIDENCE-layer concept (multiple URL/RSS tokens mapping to one Universal Subject), already correctly handled today via `SUBJECT_VOCABULARY`'s many-to-one shape — NOT part of this design, no new mechanism needed here |
| **Classification Rule** (admin-editable "URL pattern → field") | Explicitly OUT OF SCOPE for this migration per §3 — a separate, later feature that will TARGET a `field_code` once one exists, not something this design builds |
| **Ranking activation** (`rankingFlags.js`'s `'ms-MY.Politik'`) | Must key on `field_code` (`'ms-MY.crime'`), never the mutable label, so a rename never silently deactivates a ranking pilot |
| **Editorial Filter** (currently field-blind) | Confirmed no field-scoping exists today (§1f) — if ever added, must reference `field_code` from day one |
| **Pin's `new_field`** | Must migrate to `new_field_code` alongside reclassify's same column (they share it) — governance-limit queries (`reviewQueueAdapter.js:428`) must compare `field_code`, not label |
| **Existing 491 `edition_story_classifications` rows** | A live migration pass converting stored labels to stable codes is required — real production data work, its own careful plan (batch update, verification, rollback), separate from this design doc |

## 7. Two independent taxonomy lists — must be resolved as part of this work

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
- **Does not build Classification Rules** (admin-editable "URL pattern
  → field") — explicitly out of scope per §3, a separate later feature
- Does not finally lock §5's edition-vs-global `field_code` scope
  question — flagged as needing one more review pass

## Next

Awaiting ChatGPT's review of the revised design (§3 Taxonomy vs
Classification Rule split, §4 rename/merge/split semantics, §5
edition-vs-global field_code scope) before any implementation/migration
document is written. Per ChatGPT's stated order: this design →
architecture decision → implementation/migration plan → only then a
new classification generation, Filter UI, and `_old` retirement
resume.
