# Backend Control Plane — Phase 3: Classification Rules Implementation Plan V1

Status: PLAN ONLY. No SQL/code in this document — this describes what will
be built and in what order, per ChatGPT's "GO → Implementation Plan"
approval of `control-plane-phase3-classification-rules-design-v1.md`.
Actual SQL/code comes in a separate step after this plan is reviewed,
matching the workflow already used for Phase 1/2.

## 1. Table: `classification_rules`

Columns (per Design V1 §3, §4a/§4b):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK, default `gen_random_uuid()` | Stable identity — this is what `edition_story_classifications.classification_rule` stores; never changes across rename/archive |
| `rule_type` | TEXT, CHECK IN `('source','url','keyword')` | |
| `edition_id` | TEXT, nullable | NOT NULL for edition-specific rules, NULL for global |
| `pattern` | TEXT NOT NULL | Semantics depend on `rule_type` (§4c: `sources.id` for `source`, path substring for `url`, phrase for `keyword`) |
| `field_code` | TEXT, nullable | Set only when `edition_id` is set (§4a) |
| `subject_code` | TEXT, nullable | Set only when `edition_id` is NULL (§4b) |
| `priority` | INTEGER NOT NULL DEFAULT 0 | Flat across all rule types (§5a, revised) |
| `status` | TEXT NOT NULL DEFAULT `'active'`, CHECK IN `('active','archived')` | No hard delete, matches `taxonomy_fields` convention |
| `created_by` | TEXT | Admin identifier, for explainability |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Constraints:
- `CHECK ((edition_id IS NOT NULL AND field_code IS NOT NULL AND subject_code IS NULL) OR (edition_id IS NULL AND subject_code IS NOT NULL AND field_code IS NULL))` — the mutual-exclusion invariant from Design V1 §3.
- `FOREIGN KEY (edition_id, field_code) REFERENCES taxonomy_fields (edition_id, field_code)` — only enforceable/checked when both columns are non-null (standard Postgres composite FK behavior with NULLs), which is exactly the case this needs to validate (§4a).
- `pattern` referential integrity for `rule_type = 'source'` (must exist in `sources.id`) is **not** a DB constraint — enforced in the write RPC (§4c), matching this project's established pattern (`merge_taxonomy_fields()` validates internally rather than relying solely on DB constraints).
- Index on `(rule_type, status)` for the resolver's lookup pattern (fetch active rules by type); index on `(edition_id)` for edition-scoped lookups.

## 2. RLS / privilege — applying this session's hard-learned lesson directly

**Every write function gets an explicit `REVOKE EXECUTE ... FROM PUBLIC`
in the same file as its `GRANT ... TO service_role`, never as a
follow-up fix.** This is not optional — it is the direct, named lesson
from the security incident found and fixed during Phase 2 browser cutover
(anon successfully renamed a production Kategori because `GRANT TO
service_role` alone left PostgreSQL's default PUBLIC execute grant
unrevoked). Every RPC function in this phase's schema file explicitly
revokes PUBLIC before granting service_role, in the same statement block,
not a separate follow-up file.

Read access: per ChatGPT's "public read jika UI Admin memerlukannya
melalui authenticated path" — `classification_rules` is Admin-only data
(unlike `taxonomy_fields`, the public Reader never needs it), so RLS +
`GRANT SELECT TO authenticated` only, no `anon`. `edition_story_classifications`
already grants `SELECT TO anon, authenticated` (existing, since the public
Reader displays classification results) — the two new provenance values
this phase writes into its existing columns need no RLS change at all,
already covered.

## 3. RPC functions (write layer, service_role only)

Following the exact shape Phase 2 established (`schema-taxonomy-fields-rpc-v1.sql`):

- `add_classification_rule(rule_type, edition_id, pattern, field_code, subject_code, priority, created_by)` — validates the mutual-exclusion invariant (defense in depth alongside the CHECK constraint) and, for `rule_type = 'source'`, validates `pattern` exists in `sources.id` before insert (§4c).
- `archive_classification_rule(id)` — sets `status = 'archived'`. No hard delete, ever.
- `restore_classification_rule(id)` — sets `status = 'active'`. Symmetric with `archive`, matches the reversibility Phase 2's taxonomy functions already provide.

Not building in V1 (per ChatGPT's explicit "Jangan bina V2 editing UI lagi"):
`rename_classification_rule`, `update_classification_rule` (change
pattern/target/priority on an existing row) — V1 only needs to *create*
rows (for the migration seed, §5) and *archive/restore* them; editing an
existing rule's match/target is a V2 concern. This keeps V1's RPC surface
the minimum needed to seed data and let Admin toggle rules off, not a full
CRUD surface.

## 4. Read adapter (thin, matches `listTaxonomyFields()`'s pattern)

- `listClassificationRules()` — plain `.from('classification_rules').select()`, no RPC needed for a read (same correction ChatGPT made for Taxonomy's `listTaxonomyFields()` in Phase 2).
- `getClassificationRuleById(id)` — for provenance display: given a story's `classification_rule` id, fetch the rule's current type/pattern/target/status to render "Rule: keyword 'didakwa' (priority 20) [archived]" in Admin.

## 5. Classifier integration — one new gate, nothing else touched

Per Design V1 §5b/§10: a new function,
`resolveClassificationRule(story, editionId, activeRules)`, runs as a NEW
first step inside `classifyForEdition()`, before today's step 1 (edition
rules). If it returns a match, `classifyForEdition()` returns immediately
with `classification_method = 'admin_rule'`, `classification_rule = <rule id>`,
`field = <resolved field_code>` — skipping edition rules, confidence gate,
and default placement entirely for that story/edition. If it returns null
(no match, or a global rule matched but was unresolved per §4b-i),
`classifyForEdition()`'s existing logic runs completely unchanged — this
function is purely additive, `story-understanding.mjs` is not touched at
all, and the existing 4-step resolver in `edition-classification.mjs` is
not reordered or modified, only prefixed.

`resolveClassificationRule()` itself implements Design V1 §5a's full
precedence:
1. Filter `activeRules` (status='active') to those matching this story
   (source_id, URL substring, or keyword phrase against title+description).
2. If zero matches → return null.
3. If ≥1 match: sort by `priority` descending (flat across types).
4. Top priority — if unique, that's the winner. If tied: only compare
   pattern specificity when the tied rules are the SAME `rule_type`; a
   cross-type tie at the same priority returns null (reject, per §5a step 3).
5. For the winning rule: if `edition_id` is set, target is
   `field_code` directly (already edition-correct by construction). If
   `edition_id` is NULL, resolve `subject_code` → `field_code` for the
   CURRENT edition via the exact same lookup `resolveDefaultPlacement()`
   already performs; if no active `taxonomy_fields` row in this edition
   carries that subject, return null (§4b-i — unresolved, not a match).

## 6. Migration — seeding the 29 `knownCategory` Source rules

One-time script (`db/migrate-known-category-to-rules.mjs`, mirroring
`db/backfill-taxonomy-fields.mjs`'s fail-closed pattern from Phase 2):

1. Read every `lab/sources.js` entry with a `knownCategory` set (29 today,
   confirmed by direct read during the audit).
2. For each, look up `knownCategory`'s value in the existing
   `SUBJECT_VOCABULARY` table (`desk-vocabulary.mjs`) to resolve it to a
   Universal Subject — this is a **read-only lookup against code already in
   production**, not new logic.
3. Insert one `classification_rules` row per source: `rule_type = 'source'`,
   `edition_id = NULL`, `pattern = <sources.id>`, `subject_code = <resolved
   subject>`, `priority = 0` (baseline — Admin can raise individual rules
   later if a real collision is found), `status = 'active'`.
4. Fail-closed: refuse to run if `classification_rules` already has any
   `rule_type = 'source'` rows (same "don't double-seed" guard
   `backfill-taxonomy-fields.mjs` uses), and verify the inserted count
   equals exactly the number of `knownCategory` entries found in step 1
   before considering the migration successful.
5. **`lab/sources.js`'s `knownCategory` field is NOT removed by this
   migration.** It keeps functioning as Tier 1 evidence exactly as today —
   the new Source rules are additive, sitting in front of the existing
   pipeline (§5), not a replacement requiring the old field's removal.
   Removing `knownCategory` from `lab/sources.js` is an explicit
   follow-up decision for later (it would need its own dry-run parity
   check to confirm the new rules produce identical classification
   outcomes first), not part of this phase.

## 7. Rollback plan

- Migration: `classification_rules` is a brand-new, empty-by-default
  table — if the seed migration needs reverting, `DELETE FROM
  classification_rules WHERE rule_type = 'source' AND created_by =
  'migration-known-category-v1'` (tagging seed rows with a distinct
  `created_by` value specifically to make this possible) fully reverts
  to pre-migration state with zero effect on `knownCategory` itself
  (untouched, per §6 point 5).
- Classifier integration: `resolveClassificationRule()` is a pure
  prefix — if it needs to be disabled entirely, the one-line call at the
  top of `classifyForEdition()` is removable without touching anything
  else in the resolver, reverting classification behavior to exactly
  today's (pre-Phase-3) pipeline.
- Schema: additive only (new table, 2 new values used in existing enum-like
  TEXT columns) — no existing column type, constraint, or table is altered,
  so no destructive rollback is ever needed at the schema level.

## 8. Test plan (parity/regression, per ChatGPT's requirement)

1. **Static audit** (`db/classification-rules-static-audit.test.mjs`,
   matching Phase 2's `taxonomy-fields-static-audit.test.mjs` pattern):
   structural checks on the SQL once written — CHECK constraint present,
   composite FK present, REVOKE-before-GRANT present on every write
   function, no `anon` grant on `classification_rules`.
2. **Functional test against real production RPCs**
   (`classification-rules-functional-test.mjs`, matching Phase 2's
   pattern): add → archive → restore → verify status transitions; add a
   `source`-type rule with an invalid `pattern` (not in `sources.id`) and
   confirm the RPC rejects it; clean up test rows after, verify row count
   returns to baseline.
3. **Classifier parity/regression** (extends the existing
   `--dry-run` classification distribution check used for the Phase 2
   `classify-production.js` cutover): run classification with
   `resolveClassificationRule()` wired in but zero active rules (V1's
   actual initial production state before migration) — byte-identical
   output to the current pre-Phase-3 distribution confirms the new gate
   is a true no-op when empty. Then run again with the 29 migrated Source
   rules active and diff the distribution — every changed story should be
   attributable to exactly one of the 29 migrated rules (spot-checked
   against `lab/sources.js`'s `knownCategory` values), not an unexplained
   shift.
4. **Full `npm test` suite** — 0 regressions, same gate every prior phase
   has used before calling a change complete.
5. **Live verification** (once code is written and deployed, per this
   project's established discipline): confirm Admin's read-only rules list
   renders, confirm a classified story shows the correct provenance
   (`admin_rule` + rule detail) when a rule fired, confirm anon/PUBLIC
   cannot call any write RPC (repeat the exact `code=42501` check used to
   verify Phase 2's containment fix) **before** considering this phase
   done — not just before writing the code.

## Explicitly out of scope (carried forward)

Attention Rules, Pin automation, generic rule engine, ranking/scoring,
V2 editing UI (rename/update an existing rule's pattern/target/priority),
removing `knownCategory` from `lab/sources.js`, and
`edition-rules.mjs`'s `foreign_politics_to_world` (stays as-is, not
absorbed into this table).
