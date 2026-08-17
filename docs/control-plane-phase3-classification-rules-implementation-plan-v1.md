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

**Explicit V1 limitation, stated per ChatGPT's request rather than left
implicit**: `priority` is set only at rule creation (`add_classification_rule`'s
argument). There is no `update_priority` RPC in V1 — an Admin who wants to
change an existing rule's priority must archive it and add a new one.
This is intentional, not an oversight: V1's backend API is deliberately
scoped to what seeding/testing and single-rule create/archive/restore
need, not full rule management. If this V1 read-only-Admin-UI posture
holds, it's a non-issue; if V1's Admin surface ever needs to let an admin
tune priority without archive+recreate, that's a V2 decision, not
something this plan should stretch to cover now.

Not building in V1 (per ChatGPT's explicit "Jangan bina V2 editing UI lagi"):
`rename_classification_rule`, `update_classification_rule` (change
pattern/target/priority on an existing row) — V1 only needs to *create*
rows (for Admin-initiated rules, §6) and *archive/restore* them; editing an
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

## 6. Legacy `knownCategory` semantic preservation — REVISED per ChatGPT's rejection of the original migration approach

**The original plan (auto-seed all 29 `knownCategory` entries as active
Classification Rules) is withdrawn — it was a correctness bug, not a
simplification.** `knownCategory` today is Tier 1 *evidence*, confidence
0.75, competing normally against Tier 2 `url_path` evidence (confidence
0.90) inside `story-understanding.mjs`'s existing aggregation — a story
from a `knownCategory: 'hiburan'` source whose URL contains `/jenayah/`
correctly resolves to Jenayah today, because url_path evidence (0.90)
outranks publisher_declared evidence (0.75). A Classification Rule is not
evidence — per Design V1 §5b, it **short-circuits and wins outright**.
Auto-migrating all 29 sources into active rules would silently convert
every one of them from "usually right, can be outranked by stronger
evidence" into "always right, no matter what the URL says" — reversing
existing, correct classifier behavior for real stories with no Admin
decision behind the change, and reintroducing exactly the RTM-style
misclassification bug this project has already fixed once.

### 6a. `knownCategory` stays exactly as-is for V1 — not touched, not migrated

`lab/sources.js`'s `knownCategory` field continues to feed Tier 1
`publisher_declared` evidence into `story-understanding.mjs` precisely as
it does today. Phase 3 makes zero changes to it, zero changes to its
confidence weighting, and zero changes to `desk-vocabulary.mjs`'s
`SUBJECT_VOCABULARY` lookup it relies on.

### 6b. `classification_rules` ships EMPTY — no bulk seed, no default migration

V1 goes to production with **zero rows** in `classification_rules`. There
is no migration script that runs automatically or as part of deployment.
The table, RPCs, and Admin read-only view exist and work — but nothing is
pre-populated. This means: on day one of Phase 3 shipping, classification
behavior for every story is **byte-identical to today** — not "should be
identical after a parity check," but *structurally* identical, because
`resolveClassificationRule()` (§5) has nothing to match against and always
returns null, so every story falls straight through to the unchanged
existing classifier.

### 6c. How Admin adopts a Source Rule — deliberate, one at a time, per source

If Admin wants a specific source's stories to be *always* one Kategori
regardless of what URL/keyword evidence might otherwise suggest (the real
capability Izzat asked for), they create a Source Rule for that one source
via `add_classification_rule` — a deliberate, visible, one-source-at-a-time
decision, not a silent bulk import. From that point on, for THAT source
only, the Admin Rule short-circuits and wins (per §5b) — `knownCategory`
for that source becomes redundant once a matching admin Source Rule
exists (both would agree on the outcome for stories where evidence-tier
classification already matched `knownCategory`, and the Admin Rule wins
outright for any that didn't) but is still not removed from
`lab/sources.js` — no code change required to adopt a rule.

The 29 `knownCategory` sources remain a documented, ready reference for
which sources are natural first candidates if Admin wants to start
creating Source Rules (the same list this phase's audit already produced)
— but adopting any of them is now an explicit per-source Admin action in
V1's Admin UI (a future phase, since V1 is read-only for rules — see §1's
"what Admin can see"), or a manually-run one-off `add_classification_rule`
call for testing, never an automatic bulk migration.

### 6d. Coexistence and override proof — acceptance tests (added per ChatGPT's request, see §8 for the full test plan)

Three concrete cases prove the two systems coexist correctly:

1. **No Admin Rule exists** — RTM Hiburan source (`knownCategory: 'hiburan'`)
   publishes a story with URL containing `/jenayah/`. Expected: `Jenayah`
   (url_path 0.90 evidence wins, exactly today's behavior),
   `classification_method = 'default_mapping'` or whichever existing value
   the current pipeline already produces for this case — **never**
   `'admin_rule'`, since no Classification Rule exists yet.
2. **Admin creates a Source Rule** — same story as above, but Admin has
   now explicitly created `rule_type='source', pattern='rss-rtm-hiburan',
   subject_code='Entertainment', priority=100`. Expected: `Hiburan`,
   `classification_method = 'admin_rule'`, `classification_rule = <rule id>`
   — the explicit rule now overrides the URL evidence, because Admin chose
   to make it absolute for this source.
3. **Admin creates a URL Rule instead** — an unrelated source (no
   `knownCategory`, no Source Rule) publishes a story with URL containing
   `/jenayah/`, and Admin has created `rule_type='url', pattern='/jenayah/',
   field_code='jenayah'` (ms-MY). Expected: `Jenayah`,
   `classification_method = 'admin_rule'` — proving URL rules work
   identically to Source rules for the override mechanism, just scoped to
   a different match type.

Case 1 proves nothing breaks by default. Cases 2 and 3 prove the override
genuinely works once, and only once, Admin deliberately creates it.

## 7. Rollback plan

- Schema: additive only (new table, 2 new values used in existing
  enum-like TEXT columns) — no existing column type, constraint, or table
  is altered, so no destructive rollback is ever needed at the schema
  level. Since V1 ships with zero seed rows (§6b), there is no seed data
  to revert in the first place.
- Any rule an Admin creates for real (§6c) reverts via `archive_classification_rule`
  (no hard delete, per §1) — the rule stops matching immediately,
  `knownCategory`/the existing classifier resumes deciding that source's
  stories exactly as before the rule existed.
- Classifier integration: `resolveClassificationRule()` is a pure
  prefix — if it needs to be disabled entirely, the one-line call at the
  top of `classifyForEdition()` is removable without touching anything
  else in the resolver, reverting classification behavior to exactly
  today's (pre-Phase-3) pipeline.

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
   returns to baseline (which is **zero**, per §6b — this test must leave
   `classification_rules` empty again, not just "back to some prior seeded
   count").
3. **Classifier parity/regression**: run classification with
   `resolveClassificationRule()` wired in and `classification_rules` at
   its true V1 production state — **empty** — and confirm byte-identical
   output to the current pre-Phase-3 distribution (this is now the ONLY
   parity case needed, since there is no seeded-rules state to diff
   against per §6b). Then, separately, run the three §6d acceptance
   cases (RTM Hiburan+`/jenayah/` with no rule, with a Source Rule, and
   an unrelated source with a URL Rule) as targeted functional tests —
   confirming both the no-op default state and the override mechanism,
   rather than a bulk before/after distribution diff.
4. **Full `npm test` suite** — 0 regressions, same gate every prior phase
   has used before calling a change complete.
5. **Live verification** (once code is written and deployed, per this
   project's established discipline): confirm Admin's read-only rules list
   renders (empty, initially), confirm a manually-created test rule's
   provenance (`admin_rule` + rule detail) shows correctly on a real
   classified story, confirm anon/PUBLIC cannot call any write RPC (repeat
   the exact `code=42501` check used to verify Phase 2's containment fix)
   **before** considering this phase done — not just before writing the
   code.

## Explicitly out of scope (carried forward)

Attention Rules, Pin automation, generic rule engine, ranking/scoring,
V2 editing UI (rename/update an existing rule's pattern/target/priority),
removing `knownCategory` from `lab/sources.js`, bulk-migrating
`knownCategory` into `classification_rules` (withdrawn per §6 — may be
revisited later only with its own dedicated equivalence review, not as
part of this phase), and `edition-rules.mjs`'s
`foreign_politics_to_world` (stays as-is, not absorbed into this table).
