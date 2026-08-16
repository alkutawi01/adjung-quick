# Backend Control Plane — Implementation Plan v1 (2026-08-16)

Status: `[x] Plan` `[ ] Approved` — **design/plan only, no code, no
schema, no migration executed, no production change, no frontend**

Follow-up to `docs/backend-single-source-of-truth-audit-v1.md`, per
ChatGPT's explicit sequencing (director, confidence 0.99): six phases,
each documented before any implementation. No generic rule engine, no
new UI, no production touch, no migration until this plan itself is
approved.

**Terminology lock, per Izzat's direct instruction**: user-facing
admin/reader text says **"Kategori"**, never "Bidang". Internal machine
terminology (`field_code`, `subject_code`, code comments, this plan)
keeps existing names — only what an admin/reader actually reads changes.

**Target end-state, per ChatGPT:** an admin opens Quick and never needs
to know `taxonomy-registry.mjs`, `lab/sources.js`, or
`classify-production.js` exist. They see: Sumber, Kategori, Peraturan,
Berita, Ingestion, Klasifikasi, Editorial — and every one of those
screens genuinely controls the backend, not a mirror of it.

## Phase 1 — RSS Source Registry (highest priority, per ChatGPT: "perubahan paling penting dalam seluruh audit")

**Current source of truth**: `lab/sources.js`'s `RSS_SOURCES` array (43
entries, hardcoded). The `sources` Postgres table is a dumb mirror,
fully overwritten every ingestion run from this array
(`db/ingest-production.js:104-109`) — writing to it directly today is
silently clobbered on the next run.

**Target source of truth**: `sources` table becomes real, authoritative
data. `db/ingest-production.js` reads the active source list FROM the
table, never from a static JS import.

**Schema/API/RPC needed**:
- Extend `sources` (schema already close — `db/schema.sql:15-27` has
  `id, name, url, language, trust_score, coverage, active,
  last_success_at, last_failure_at, last_failure_reason`) with the
  columns that currently only exist in JS: `known_category`,
  `source_type`, `exclude_patterns` (array), `extra_ca` (nullable,
  rare TLS case).
- `add_source(name, url, language, trust_score, known_category?,
  source_type?, exclude_patterns?)` RPC.
- `set_source_active(source_id, active, reason?)` RPC — replaces
  `status: 'disabled'` in code.
- `update_source(source_id, ...fields)` RPC for metadata edits.

**Migration**: one-time backfill inserting all 43 `RSS_SOURCES` entries
into the (extended) `sources` table as the initial authoritative
snapshot — after this, `lab/sources.js` stops being read at ingest
time. Deterministic, no ambiguity (it's a direct 1:1 copy of existing
known data, not a re-derivation).

**Consumers affected**: `db/ingest-production.js` (reads source list),
`lab/rss.js` (per-source `excludePatterns`/`status` checks),
`db/classify-production.js` (indirectly, via which items exist to
classify). Any lab/*.js test fixtures that currently import
`RSS_SOURCES` directly — needs a compat check, not solved here.

**Rollback**: keep `lab/sources.js` in the repo, unused but present, as
a documented historical fallback for one release cycle — if the DB read
path breaks, a manual revert to the static import is a one-line change,
not a data-loss event.

**Verification**: `db/ingest-production.js --dry-run` produces the
IDENTICAL item/cluster counts against the DB-sourced list as it did
against the JS array, before ever running `--write`.

**Stays hardcoded**: nothing — this whole phase's point is that the
source registry stops being code.

## Phase 2 — Taxonomy / Kategori

**Current source of truth**: `classification/lib/taxonomy-registry.mjs`'s
`TAXONOMY_REGISTRY` (hardcoded JS, just consolidated from two files
into one in the prior migration — still 100% code). No
`taxonomy_fields` table exists.

**Target source of truth**: a real `taxonomy_fields` table (per
`docs/taxonomy-stable-field-id-design-v1.md`'s §1 sketch:
`field_code, edition_id, label, subject_codes[], display_order,
active`), admin-editable for `label`/`active`/`display_order`.
`field_code` and `subject_codes` (the actual identity/grouping) are
**not** casually admin-editable — rename is safe and free (label only);
merge/split are real data operations, gated behind their own explicit
confirmation flow, not a plain edit form.

**Schema/API/RPC needed**:
- `taxonomy_fields` table.
- `rename_category(edition_id, field_code, new_label)` — label-only,
  zero data migration, matches §4 of the design doc exactly.
- `merge_categories(edition_id, from_field_codes[], into_field_code,
  into_label)` — a real backend operation: updates the taxonomy table
  AND re-projects existing `edition_story_classifications`/
  `story_overrides` rows server-side (replacing today's disconnected
  manual `backfill-taxonomy-codes.mjs --write` CLI step).
- `split_category(...)` — per the design doc, this cannot be automated
  (no way to know which existing stories go where); the RPC's job is
  only to create the new taxonomy entries and flag affected existing
  rows for manual editorial reassignment, never to auto-split data.
- `set_category_active(edition_id, field_code, active)` — deprecate
  without deleting history.

**Migration**: seed `taxonomy_fields` from the current
`TAXONOMY_REGISTRY` (already fully specified — 16/16/13 entries with
`field_code`/`label`/`subject_codes`/`wheel_visible`, done in the prior
Taxonomy Stable Field-ID migration). `edition-taxonomy.mjs` and
`state/editions.js` switch from importing the static file to querying
this table (or a cached read of it).

**Consumers affected**: everything already migrated to `field_code` in
the prior pass (`reducer.js`, `rankingFlags.js`, `productionAdapter.js`,
admin overrides) — none of their comparison LOGIC changes, only where
the taxonomy list itself is fetched from.

**Rollback**: `TAXONOMY_REGISTRY` stays in the repo as a documented
fallback/seed source for one release cycle, same posture as Phase 1.

**Verification**: reader Wheel renders an IDENTICAL field list (same
order, same labels) sourced from the DB as it did from the static file.

**Stays hardcoded**: the `subject_code` vocabulary itself (Phase 5) —
taxonomy fields reference subject codes, they don't define what a
subject code IS.

## Phase 3 — Classification Rules (URL/keyword → Kategori)

**Current source of truth**: does not exist as a backend concept.
`classification/lib/edition-rules.mjs`'s `EDITION_RULES` (1 hardcoded
rule, ms-MY only) is the closest analog, plus the URL-path tier inside
`story-understanding.mjs` (generic, not rule-based).

**Target source of truth**: a real `classification_rules` table —
admin-visible FIRST (read-only: "why did this story get this Kategori"),
editable SECOND, per ChatGPT's own two-stage instruction.

**Schema/API/RPC needed**:
- `classification_rules` table: `id, edition_id, match_type
  ('url_path'|'keyword'), match_value, target_field_code, priority,
  active, created_by, created_at`.
- V1 read-only: `list_classification_rules(edition_id)` — surfaces
  what's already hardcoded in `EDITION_RULES` today, converted to rows.
- V2 (later, not this phase): `add_classification_rule(...)`,
  `deactivate_classification_rule(...)`.

**Migration**: seed `classification_rules` from the current
`EDITION_RULES` array (1 real rule today) — trivial, small dataset.

**Consumers affected**: `edition-classification.mjs`'s
`evaluateEditionRules()` reads from the table instead of the static
`EDITION_RULES` import; resolution ORDER/logic unchanged.

**Rollback**: same pattern — static file kept as documented fallback.

**Verification**: classification output for the one existing rule
(`foreign_politics_to_world`) is byte-identical before/after the
migration.

**Stays hardcoded (for now)**: the desk-vocabulary tiers themselves —
this phase only covers explicit editorial RULES (admin-authored), not
the underlying evidence vocabulary (Phase 5's separate, more careful
question).

## Phase 4 — Source Overrides (use what already exists, per ChatGPT: "jangan bina benda baru sebelum kita gunakan apa yang sudah ada")

**Current source of truth**: `source_overrides` table exists
(`db/schema-editorial-state.sql:51-63`) — schema-complete
(`ignore_category`/`reduce_trust`/`disable`), zero runtime effect, no
admin UI, `source_id` explicitly not a real FK ("that registry is code,
not a table" per the schema's own comment — resolved by Phase 1).

**Target source of truth**: same table, actually wired into the
pipeline it was designed for.

**Schema/API/RPC needed**: no new schema — the table already has the
right shape. Needs:
- A real FK to `sources.id` now that Phase 1 makes `sources` authoritative.
- Wiring: `lab/rss.js`/`db/ingest-production.js` check `disable`
  before fetching; `story-understanding.mjs` checks `ignore_category`
  before using a source's `knownCategory` as Tier 1 evidence;
  `prominence` scoring (`lab/engine.js`) checks `reduce_trust`.
- `create_source_override(source_id, override_type, reason,
  trust_override?)` / `deactivate_source_override(id)` RPCs.

**Migration**: none needed for existing data — this table has never
had a real effect, so there's no drift to correct. This phase is pure
wiring, not data migration.

**Consumers affected**: `lab/rss.js`, `story-understanding.mjs`,
`lab/engine.js` — three real code changes to make an existing table
matter. This is exactly the RTM-hiburan-style problem
(`docs/taxonomy stable-field-id` tier-precedence fix) generalized: a
source whose `knownCategory` can't be trusted should be `ignore_category`-
flagged via this table, not require a code-level tier-priority hack
each time.

**Rollback**: each wiring point is independently revertable (feature-
flaggable per call site) since none of them change existing data.

**Verification**: setting `ignore_category` on a known-bad source (e.g.
a hypothetical future RTM-hiburan-style feed) measurably changes its
items' classification without a code deploy.

**Stays hardcoded**: nothing new — this phase activates dormant schema.

## Phase 5 — Backend ingestion/classification jobs

**Current source of truth**: developer-run CLI scripts
(`node db/ingest-production.js`, `node db/classify-production.js
--write`), gated by env vars a human sets locally.

**Target source of truth**: a real job/RPC contract an admin action can
trigger, with status tracking — NOT a frontend button yet, per
ChatGPT's explicit "jangan bina butang frontend dulu... bina backend
job/RPC/API contract dahulu."

**Schema/API/RPC needed**:
- `ingestion_jobs` / `classification_jobs` table:
  `id, job_type, status ('running'|'succeeded'|'failed'), started_at,
  finished_at, sources_count, items_count, clusters_count,
  classifications_count, error_message, triggered_by`.
- `trigger_ingestion()` / `trigger_classification()` RPC (Edge Function
  or equivalent) wrapping the EXISTING staging+swap logic
  (`ingest-production.js`) and classify logic (`classify-production.js`)
  unchanged — this phase adds a trigger surface and status log, it does
  not rewrite the pipeline itself.

**Migration**: none — purely additive tables.

**Consumers affected**: none of the existing reader/admin paths; this
is a new, separate operational surface.

**Rollback**: the CLI scripts keep working exactly as they do today,
callable directly by a developer if the job wrapper ever needs
bypassing — this phase is additive, not a replacement.

**Verification**: `trigger_ingestion()` produces the identical result
as running the CLI script directly, with the job row correctly
reflecting real counts/errors afterward.

**Stays hardcoded**: the actual ingestion/classification algorithms —
this phase is purely about giving them a triggerable, observable
interface, never about changing what they compute.

## Phase 6 — Remaining admin operations

Per the audit's §7 table, items not covered above:
- **Desk vocabulary** (`desk-vocabulary.mjs`'s ~75 keyword mappings) —
  per ChatGPT's explicit caution, do NOT blindly move all of it to the
  database. Requires its own follow-up audit distinguishing genuine
  editorial policy (admin should control) from internal engine
  knowledge/config (fine to stay code) — named as future work, not
  decided here.
- **`*_old` table drop** — demoted from "blocker" to routine one-time
  maintenance per ChatGPT (no longer gates this plan); resolved
  separately once Phase 1-5's control-plane foundation is stable.
- **Migration runner** — every phase above still needs manual SQL
  Editor application (no automated migration path exists in this
  project). Named as the deepest structural gap in the audit; a real
  fix (tracked Supabase CLI migrations) is out of scope for this plan
  but should be raised as its own decision once Phase 1 is underway.
- **`excludeEverReleased()` client-side history** — per ChatGPT's
  explicit flag: this is frontend-only decision logic today
  (`state.history`, never cross-checked against a backend table). Target
  architecture: backend determines state, frontend only reads it. Not
  urgent enough to change immediately, but named so it isn't
  rediscovered as a surprise later — a future phase should move release
  history to a backend-verified table.

## What this document does NOT do

- No code, schema, migration, or production change
- No frontend/admin UI built
- Does not build a generic rule engine anywhere
- Does not decide the exact `classification_rules`/`taxonomy_fields`
  column types beyond the sketch above — final DDL is the next step,
  after this sequencing is approved
- Does not resolve Phase 6's desk-vocabulary or migration-runner
  questions — named as real, deliberately deferred work

## Next

Awaiting ChatGPT's approval of this phase sequencing before Phase 1's
actual schema/RPC design begins. Per the director's explicit
instruction: plan approved → THEN migration, one phase at a time, each
verified before the next — same discipline this project already
applies to ingestion staging/swap and the taxonomy field-id migration.
