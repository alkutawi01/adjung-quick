# Backend Control Plane — Phase 2: Taxonomy/Kategori, Implementation Plan v1 (2026-08-17)

Status: `[x] Plan` `[ ] Approved` — no SQL/schema/code written.

Follow-up to `docs/control-plane-phase2-taxonomy-design-v1.md` (design,
**APPROVED** by ChatGPT 2026-08-17 with 2 conditions, both incorporated
below: no separate DELETE, `field_code` validated not freeform).

## 0. The two conditions from design review, incorporated

**1. No DELETE — archive/restore only.** `taxonomy_fields` never has a
row hard-deleted by any Admin operation:
- "Hide from Wheel" → `wheel_visible = false` (row stays `active`,
  classification keeps using it, just not shown on the reader's Wheel)
- "Remove from use" (what Admin means by "padam") → `status = 'archived'`
- "Restore" → `status = 'active'`
- Historical data is never lost — same posture as every other
  editorial-adjacent table this session (`story_overrides` et al.)

**2. `field_code` is a validated machine ID, not freeform text.**
Validation, enforced at the RPC layer (never trusting client input,
same discipline as `source-registry-adapter.mjs`'s `assertAdmin()`/URL
validation):
- Lowercase only
- `^[a-z][a-z0-9_]{1,31}$` — starts with a letter, machine-safe
  characters only, no spaces, 2–32 chars
- Unique within `(edition_id)` — enforced by the table's own `UNIQUE
  (edition_id, field_code)` constraint AND checked explicitly before
  insert for a clear error message (not just a raw constraint
  violation surfaced to the Admin)
- Immutable once created — no RPC ever accepts a `field_code` change;
  only `rename_taxonomy_field()` (label-only) and
  `merge_taxonomy_fields()` (which archives, never renames, the FROM
  code) exist
- Admin-facing UI (future phase) shows `field_code` as "Kod sistem"
  read-only metadata, never a field the Admin fills in as their primary
  interaction — but Add still requires picking one at creation time
  (this phase's Add RPC, not a UI concern)

## 1. The sync/async question — answered, per ChatGPT's explicit requirement to resolve this in the plan, not during coding

**The problem, stated precisely**: `classification/lib/edition-taxonomy.mjs`'s
`EDITION_TAXONOMY` and `resolveDefaultPlacement()` are pure, synchronous,
module-level constructs — `resolveDefaultPlacement()` is called
**synchronously, in a hot loop**, from `edition-classification.mjs`'s
resolver during `classify-production.js`'s per-story classification
pass. Making it async (a live DB query per call, or even per story)
would require converting `classify-production.js`'s entire pipeline
to async/await down through every call site — a much larger, riskier
change than this phase's actual scope, exactly the kind of scope creep
both Izzat and ChatGPT just flagged.

**The answer**: `classify-production.js` is **already a short-lived CLI
process, invoked fresh per classification cycle** (confirmed — it is
never a long-running server; every run this session has been `node
db/classify-production.js --write`, once, then the process exits).
This means the taxonomy table only needs to be loaded **once, at the
very top of the script, before the classification loop begins** — a
single `await` at the top level, populating an in-memory `Map`, after
which every synchronous call for the rest of that process's lifetime
reads from the already-loaded cache. No function in the hot path
becomes async; only the script's own startup sequence gains one new
`await fetchTaxonomyFields()` call before its existing loop starts.

```
classify-production.js (top of main(), before any classification runs)
  ↓
  const taxonomyCache = await loadTaxonomyFieldsFromDB()   -- NEW, one query
  ↓
  buildEditionTaxonomyFromCache(taxonomyCache)              -- NEW, pure sync
     -- produces the EXACT SAME shape EDITION_TAXONOMY already has
     -- ({ label, default_mapping, field_code } per edition), so
     -- resolveDefaultPlacement() itself needs ZERO changes to its own
     -- logic — only where its input table comes from
  ↓
  ...existing classification loop, fully synchronous, unchanged...
```

`edition-taxonomy.mjs` itself changes from "import a hardcoded JS
constant" to "export a function that builds the same shape from an
already-fetched array" — the function signature consumers call
(`resolveDefaultPlacement(edition, subject)`) does not change; only
how `EDITION_TAXONOMY` gets populated changes, and that happens once,
outside the hot path.

**What if a taxonomy row changes mid-run?** It doesn't apply until the
next `classify-production.js` invocation — exactly the same latency
characteristic the OLD code-based system already had (a `TAXONOMY_REGISTRY`
edit required a redeploy before it took effect; now it requires the
next classification cycle instead — strictly faster, never slower).
This is an acceptable, explicitly-stated trade-off, not a silently
introduced staleness bug.

## 2. `taxonomy_fields` schema (restated from design, unchanged)

```sql
-- Illustrative shape — not applied yet
CREATE TABLE taxonomy_fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id      TEXT NOT NULL,
  field_code      TEXT NOT NULL CHECK (field_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  label           TEXT NOT NULL,
  subject_codes   TEXT[],
  wheel_visible   BOOLEAN NOT NULL DEFAULT true,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  display_order   INTEGER NOT NULL,
  UNIQUE (edition_id, field_code)
);
```

## 3. RPC / API surface — exact functions, per ChatGPT's explicit requirement

Mirrors `source-registry-adapter.mjs`'s pattern (admin-gated, one
choke point per operation, no generic "update anything" function):

- `addTaxonomyField(supabase, { editionId, fieldCode, label, subjectCodes, wheelVisible, role })`
  — validates `fieldCode` per §0's rules, admin-only, inserts with
  `status='active'`, `display_order` = current max + 1 for that edition
- `renameTaxonomyField(supabase, { id, label, role })` — label-only,
  `field_code` never in the update payload at all (not just
  "ignored" — the function signature doesn't accept it, so it's
  structurally impossible to change)
- `setTaxonomyFieldVisibility(supabase, { id, wheelVisible, role })` —
  the "Hide" operation
- `setTaxonomyFieldStatus(supabase, { id, status, role })` — `status`
  ∈ `{active, archived}`, the "Archive/Restore" operation, mirrors
  `setSourceStatus()`'s exact shape from Phase 1
- `mergeTaxonomyFields(supabase, { editionId, fromFieldCode, intoFieldCode, role })`
  — the one multi-step operation, detailed in §4
- `listTaxonomyFields(supabase, { editionId })` — read helper, no
  admin gate needed (read-only)

All write operations admin-only via the same `isAdmin(role)` /
`assertAdmin()` choke point already established in
`db/editor-auth.mjs` and reused by every prior phase's adapter.

## 4. Merge — exact transaction contract

```sql
-- Illustrative — not written as real SQL yet
BEGIN;
  UPDATE edition_story_classifications
    SET field_code = :into_code, field = (SELECT label FROM taxonomy_fields WHERE field_code = :into_code AND edition_id = :edition)
    WHERE field_code = :from_code AND edition_id = :edition;

  UPDATE story_overrides
    SET new_field_code = :into_code, new_field = (SELECT label FROM taxonomy_fields WHERE field_code = :into_code AND edition_id = :edition)
    WHERE new_field_code = :from_code AND edition_id = :edition
      AND override_type = 'reclassify';  -- only reclassify rows set new_field_code at all

  UPDATE taxonomy_fields SET status = 'archived' WHERE field_code = :from_code AND edition_id = :edition;
COMMIT;
```

Single transaction — a merge that updates `edition_story_classifications`
but not `story_overrides` (or vice versa) would leave the reader and
Review Queue disagreeing about a story's field, a worse state than no
merge at all. `into_code` must already exist and be `active`
(validated before the transaction starts, fail-closed if not).

## 5. Backfill — 45 rows, fail-closed (same discipline as every prior backfill this session)

```
node db/backfill-taxonomy-fields.mjs --dry-run   (prints only)
node db/backfill-taxonomy-fields.mjs --write     (inserts)
```

Reads `TAXONOMY_REGISTRY` directly (the exact 45-row source — 16
ms-MY + 16 en-global + 13 ar-global, per direct count of the current
file), maps 1:1 to `taxonomy_fields` rows (`display_order` = array
index within each edition, preserving the existing curated Wheel
order documented in the registry's own comments), refuses to run if
the table already has rows (same "no double-insert" guard as Phase
1's `backfill-source-registry-staging.mjs`), verifies post-insert count
== 45 exactly.

## 6. Migration order

1. Apply `taxonomy_fields` schema (additive, standalone-safe)
2. Run backfill `--dry-run`, review, then `--write` — verify 45/45
3. Add the 6 RPC functions (§3) — pure additions, nothing else touched yet
4. **Consumer cutover, staged**:
   a. `classification/lib/edition-taxonomy.mjs`: change from importing
      the JS constant to exporting `buildEditionTaxonomyFromCache()`
      (§1) — `classify-production.js` gains the one top-level `await`
   b. `state/editions.js`: change from importing `TAXONOMY_REGISTRY`
      to querying `taxonomy_fields` at reader app startup (the reader
      is a long-running client app, not a CLI — this can be a normal
      async fetch at app-init time, same pattern the reader already
      uses for `sources`/`story_clusters` via `productionAdapter.js`)
   c. Every other consumer (`App.jsx`, `AdminApp.jsx`, `ReviewQueueCard.jsx`,
      `state/reducer.js`) — **zero changes**, confirmed in design §3,
      they consume `EDITIONS`/`getFieldEntry()`'s existing public shape
5. `TAXONOMY_REGISTRY` in `taxonomy-registry.mjs` — **kept, not
   deleted**, same "keep the old source as reference" posture as
   `lab/sources.js` after Phase 1's cutover; nothing reads it for
   production classification/reader paths after step 4a/4b land

## 7. Rollback

- Steps 1–3 (schema + backfill + RPCs): pure additions, revert by
  simply not proceeding to step 4 — `taxonomy_fields` sits unused,
  zero risk to the live system
- Step 4a (`classify-production.js`'s data source): single-line import
  revert (`buildEditionTaxonomyFromCache()` → `EDITION_TAXONOMY`
  import again), same pattern as Phase 1's `ingest-production.js`
  rollback
- Step 4b (reader's `state/editions.js`): single-line import revert,
  same pattern
- No data migration to reverse in either case — `TAXONOMY_REGISTRY`
  never stops existing, so reverting the import is sufficient

## 8. Verification

- Backfill: 45/45 rows, field-by-field parity against `TAXONOMY_REGISTRY`
  (id/label/subject_codes/wheel_visible/display_order), same
  "0 missing, 0 extra, 0 mismatch" discipline as every prior parity
  check this session
- RPC functional tests: add a test-only field, rename it, hide it,
  archive it, restore it, merge two real (test) fields and confirm
  both `edition_story_classifications` and `story_overrides` reflect
  the merge in one transaction — mirrors Phase 1's
  `source-registry-staging.test.mjs` structure directly
- Consumer cutover verification: run `classify-production.js --dry-run`
  before AND after the 4a cutover against the same generation, confirm
  byte-identical classification output (same technique as Phase 1's
  ingestion parity check) — proves the DB-backed taxonomy produces
  the exact same classification decisions as the JS constant did
- Reader verification: load `adjung-quick.vercel.app`, confirm the
  Wheel still renders the same Kategori in the same order, for all 3
  editions
- Regression: full `npm test` suite, 0 failures required

## What this document does NOT do

- No SQL/schema/RPC code written yet
- Does not build split
- Does not build any Admin UI
- Does not touch Classification Rules, Attention Rules, or any other
  future-phase item

## Next

Awaiting ChatGPT's review before schema/RPC SQL is written.
