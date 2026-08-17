# Editorial State Orphan Lifecycle — Implementation Plan v1 (2026-08-17)

Status: `[x] Plan` `[ ] Approved` — **revised 2026-08-17 per ChatGPT's
review: §0's version check PASSED (Izzat confirmed both
`pg_advisory_xact_lock`/`_shared` exist on production), but §4's
migration order was rejected — the original A/B split briefly left a
window with neither the old FK nor the new advisory-lock mutex
protecting the swap. §4/§7 revised: the swap-function's exclusive lock
(Migration A) must be applied and verified BEFORE the FK removal
(Migration B) — never the reverse. Still read-only. No migration
executed, no FK dropped, no trigger created, no code deployed.**

Follow-up to `docs/editorial-state-orphan-lifecycle-design-v1.md`
(design, **APPROVED** by ChatGPT 2026-08-17, Option D — advisory
transaction lock). This plan covers only *how* to implement the
approved design safely — per ChatGPT's explicit instruction, this
document is a plan, not a migration; no SQL in it is executed yet.

## 0. Pre-implementation verification (per ChatGPT's explicit instruction)

**Required before any migration is written**: confirm
`pg_advisory_xact_lock`/`pg_advisory_xact_lock_shared` are available
on this project's actual Supabase Postgres instance — not assumed.

```sql
SELECT version();
SELECT proname FROM pg_proc WHERE proname IN ('pg_advisory_xact_lock', 'pg_advisory_xact_lock_shared');
```

Context (not a substitute for running the query above): these two
functions have existed in PostgreSQL core since version 9.1 (released
2011) — every actively-supported Postgres version, and every version
Supabase has ever offered, includes them. This is effectively certain
to pass, but per ChatGPT's explicit instruction this is stated as
context, not as a substitute for actually running the check against
this project's real instance before proceeding.

**Status: NOT YET RUN.** To be executed (read-only) before §3's
migration is written, via the same Supabase SQL Editor pattern used
for every prior verification this session.

## 1. What changes, exactly — scope

**FK constraints removed** (3, all currently implicit via
`REFERENCES story_clusters(id)` with no name given at creation, so
each migration step must first discover the actual constraint name —
same discipline `repoint_story_clusters_fks()` already uses, never
hardcoding a guessed default name):
- `story_overrides.story_id`
- `saved_stories.story_id`
- `history_entries.story_id`

**Not touched**: `edition_story_classifications.story_id`'s FK stays
exactly as-is, per the design's explicit §8e/§9 decision — that table
has no independent `expires_at` and is fully machine-regenerated.

**New trigger function** (one, shared across the 3 tables — matching
`forbid_representative_reassignment()`'s existing one-function-many-tables
pattern already used elsewhere in this schema):
```sql
-- Illustrative shape, name TBD at migration-writing time — NOT applied here
CREATE OR REPLACE FUNCTION validate_editorial_story_reference()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(EDITORIAL_INGESTION_LOCK_KEY);
  PERFORM 1 FROM story_clusters WHERE id = NEW.story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_id % does not exist in the current live generation', NEW.story_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
Attached as `BEFORE INSERT OR UPDATE OF story_id` on all three tables
(covers `writeOverride()`'s insert path today; `UPDATE OF story_id`
guards a hypothetical future code path that changes an existing row's
`story_id`, which nothing currently does but the trigger should not
silently miss if it ever does).

**Swap function change** (one line, first statement in
`swap_ingestion_staging()`):
```sql
PERFORM pg_advisory_xact_lock(EDITORIAL_INGESTION_LOCK_KEY);
```

## 2. The advisory lock key — one documented constant, not a scattered string (per ChatGPT's explicit instruction)

`pg_advisory_xact_lock`/`_shared` take a `bigint` key (or a
two-`int`-argument form). Per ChatGPT's instruction against "string
bersepah" (scattered/inconsistent strings), this plan commits to a
**single, named, documented constant**, defined once and referenced
everywhere it's needed:

```sql
-- Documented once, here, and nowhere else redefines this value.
-- hashtext() of a fixed string, so the actual bigint is derived and
-- documented rather than a magic number picked by hand.
-- Placeholder — the ACTUAL computed value must be pinned as a literal
-- bigint constant in the real migration (hashtext()'s output is stable
-- across calls for the same input string, but computing it fresh in
-- every trigger/function call, rather than using one fixed literal,
-- would risk two different code paths silently deriving different
-- keys if the source string is ever copy-pasted incorrectly).
SELECT hashtext('adjung_quick_editorial_ingestion_swap_boundary');
```
The migration script that eventually implements this must: run this
once, record the resulting literal `bigint`, and use that literal
(with a comment naming the source string) in both the trigger function
and `swap_ingestion_staging()` — never re-derive it via `hashtext()` at
call time in two different places, which would be exactly the
"scattered string" risk ChatGPT is flagging, just moved one level
down.

## 3. Error contract to Admin (per ChatGPT's explicit instruction)

When the trigger raises (story genuinely not in the live generation),
the raw Postgres exception (`RAISE EXCEPTION 'story_id % does not
exist...'`) reaches the application via Supabase's REST error response.
Per this project's existing pattern (`db/source-registry-adapter.mjs`'s
`assertAdmin()`/validation functions all throw a specific, human-readable
Malay message rather than surfacing a raw DB error) —
`ui/src/admin/reviewQueueAdapter.js::writeOverride()` should catch this
specific error and re-surface it as:

> *"Berita ini tiada lagi dalam edisi RSS terkini, jadi tindakan ini
> tidak dapat disimpan."*

Not a generic "something went wrong." The Admin should be able to tell,
from the message alone, that their target story is gone — not that the
app broke. Exact copy is confirmed at implementation time, not
finalized in this plan.

**Distinguishing this error from other write failures**: the trigger's
`RAISE EXCEPTION` message is matched by a stable, greppable substring
(e.g. always starting with `"story_id"` and containing `"does not
exist"`) so the JS layer can distinguish "story doesn't exist"
specifically from other DB errors (constraint violations, network
issues) rather than showing the specialized message for unrelated
failures.

## 4. Migration order — REVISED per ChatGPT's second review (2026-08-17)

**The first draft's order had a real gap.** It proposed dropping the 3
FKs and installing the SHARED-lock trigger first (Migration 1), then
separately patching `swap_ingestion_staging()` to take the EXCLUSIVE
lock (Migration 2). Between those two migrations — however briefly —
the old FK is already gone but the swap function does not yet take the
advisory lock. In that window, a concurrent ingestion swap and an
editorial write have **no boundary between them at all**: not the old
FK (removed), not the new advisory-lock mutex (only half-installed).
That's a real regression to the exact class of problem this design
exists to close, even if only open for the duration between two
migrations. **Rejected — order reversed below.**

**Migration A — patch `swap_ingestion_staging()` first, FK still in place**:
1. Run §0's verification query — confirm `pg_advisory_xact_lock`/`_shared` exist (done — §0, passed).
2. Compute and record the lock key constant (§2) — one literal `bigint`, documented.
3. `CREATE OR REPLACE FUNCTION swap_ingestion_staging()` — add
   `PERFORM pg_advisory_xact_lock(EDITORIAL_INGESTION_LOCK_KEY);` as
   its first statement, otherwise unchanged.
4. **Verify Migration A** (§7) before proceeding to B. At this point:
   the 3 old FKs are STILL IN PLACE (unchanged), and the swap now ALSO
   takes the exclusive advisory lock. Both a hard-FK safety net and the
   new mutex exist simultaneously — strictly safer than either the old
   or the new design alone, never less safe.
5. **No production ingestion run is treated as a "test" during this
   window** — any real ingestion that happens to run after Migration A
   is production traffic, not a deliberate experiment, and needs no
   special handling since Migration A alone is already safe per step 4.

**Migration B — remove the 3 FKs, install the shared-lock trigger — ONLY after Migration A is verified**:
6. `BEGIN` a single transaction:
   a. Create the shared trigger function (takes
      `pg_advisory_xact_lock_shared(EDITORIAL_INGESTION_LOCK_KEY)`
      first, per §1).
   b. Attach it as `BEFORE INSERT OR UPDATE OF story_id` on
      `story_overrides`, `saved_stories`, `history_entries`.
   c. Discover each table's actual FK constraint name (via
      `pg_constraint`, same technique `repoint_story_clusters_fks()`
      already uses — never a guessed default name) and `DROP
      CONSTRAINT` it, for all three tables.
   d. `COMMIT`.
7. **Verify Migration B** (§7) — including the NEW check in §7 that
   confirms both sides of the boundary exist together before the old
   FK is considered retired (see §7's addition below).

**Hard dependency, stated explicitly per ChatGPT's instruction**:
**Migration B must never be applied before Migration A is applied AND
verified.** Applying B first (or applying B without A having
succeeded) recreates exactly the gap this revision exists to close.
This is not a preference — it is the one ordering constraint this
whole plan revision was written to enforce.

**Why still two separate migrations, not one**: per the first draft's
original reasoning — independently diagnosable, independently
revertable — but now with an explicit, enforced order between them
rather than an implied "either order is fine" the first draft
accidentally suggested by using neutral language ("separately").

## 5. What happens to existing orphaned rows (per ChatGPT's explicit instruction — do NOT clean them up)

**Nothing.** The two test-residue rows found and removed by hand this
session (`db/generated/orphan-editorial-state-audit-20260817.md`) are
already gone — that was a one-time, manually-verified, specific-row
deletion, not a mechanism. Any OTHER row that is currently orphaned (if
any exist beyond what was already audited) is explicitly left alone by
this migration. Dropping a FK does not retroactively validate or
invalidate any existing row — it simply stops enforcing the constraint
going forward. Existing orphaned rows keep behaving exactly as §5 of
the design doc describes (inert to the reader, visible-with-context to
future Admin UI, self-expiring via their own `expires_at`) — this
migration does not query for them, count them, or act on them in any
way. Retention/cleanup of already-orphaned rows remains the explicitly
separate, undecided question §10 of the design doc named.

## 6. Rollback plan — reordered to match §4's revised A→B dependency

**If Migration A needs to be reverted** (before B was ever applied,
or independent of B): `CREATE OR REPLACE FUNCTION
swap_ingestion_staging()` back to its current committed body (commit
`9b6984a`, the FK-cycle-drop fix, is the last known-good version) — a
single-statement revert, no data migration involved either direction.
**This is safe at any time** — Migration A only adds a lock acquisition
to a function; it never removes a safety mechanism, so reverting it
never re-opens the gap this design closes (the old FK, if still present
because B hasn't run yet, keeps protecting editorial writes regardless
of A's state).

**If Migration B needs to be reverted** (only relevant once B has been
applied — per §4, B is never applied before A succeeds): re-add the
three FK constraints (`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY
(story_id) REFERENCES story_clusters(id)`, exact `ON DELETE` behavior
matching what each table had before — none of the three currently
specify one, per the design doc's own schema reading) and drop the
trigger + trigger function. This is safe ONLY if no row that would
violate the FK was inserted while the trigger (not the FK) was the
only guard — which is exactly what the shared-lock-gated existence
check is designed to prevent (§8d of the design). If rollback is ever
needed while orphaned rows exist that predate Migration B (§5),
re-adding the hard FK would fail against them — the same failure mode
this whole design exists to avoid; in that case, do not force the FK
back — leave Migration B in place and treat it as a forward-only change
instead, since Migration A's exclusive lock on the swap side means the
system is never left unprotected either way.

**Practical implication of the new order (§4)**: Migration A is the
"cheap, always-safe-to-revert" half; Migration B is the "one-way door"
half, precisely because it's only ever applied once A has already
established the safety net that lets B's FK removal be sound. Rolling
back A alone is always fine. Rolling back B alone should be treated as
the more consequential decision, not the routine one.

## 7. Verification queries (read-only, run after each migration, before declaring done)

**After Migration A** (per §4's revised order — run BEFORE Migration B is ever applied):

```sql
-- 0a. Confirm swap_ingestion_staging() now takes the exclusive advisory
--     lock as its first statement — source-level check, not just "it compiled"
SELECT prosrc FROM pg_proc WHERE proname = 'swap_ingestion_staging';
-- expected: prosrc's text contains 'pg_advisory_xact_lock(' before any ALTER TABLE statement

-- 0b. Confirm the 3 old FKs are STILL PRESENT — Migration A must not have touched them
SELECT conname, conrelid::regclass FROM pg_constraint
  WHERE conrelid IN ('story_overrides'::regclass, 'saved_stories'::regclass, 'history_entries'::regclass)
    AND contype = 'f' AND confrelid = 'story_clusters'::regclass;
-- expected: 3 rows (unchanged from before Migration A — this is the
-- explicit "both sides of the boundary exist together" check ChatGPT
-- required: the OLD FK safety net and the NEW advisory-lock mutex are
-- both active at the same time here, never neither)
```

**Only after Migration A's checks above both pass** does Migration B
proceed. **After Migration B**:

```sql
-- 1. Confirm the 3 FKs are actually gone
SELECT conname, conrelid::regclass FROM pg_constraint
  WHERE conrelid IN ('story_overrides'::regclass, 'saved_stories'::regclass, 'history_entries'::regclass)
    AND contype = 'f' AND confrelid = 'story_clusters'::regclass;
-- expected: 0 rows

-- 2. Confirm edition_story_classifications' FK is untouched
SELECT conname FROM pg_constraint
  WHERE conrelid = 'edition_story_classifications'::regclass AND contype = 'f'
    AND confrelid = 'story_clusters'::regclass;
-- expected: 1 row (unchanged)

-- 3. Confirm the trigger exists on all 3 tables
SELECT event_object_table, trigger_name FROM information_schema.triggers
  WHERE event_object_table IN ('story_overrides', 'saved_stories', 'history_entries');
-- expected: 3 rows (one per table), same function name

-- 3b. Confirm swap_ingestion_staging() STILL has its exclusive lock
--     (re-run 0a's check) — Migration B must not have reverted it
SELECT prosrc FROM pg_proc WHERE proname = 'swap_ingestion_staging';
-- expected: still contains 'pg_advisory_xact_lock(' as before

-- 4. Functional test — write-time validation actually rejects a garbage story_id
--    (run as a role that can INSERT, e.g. via a real editor session; a
--    fabricated non-existent id should raise, not insert)
```

**The old FK is only considered fully retired once Migration B's query
1 shows 0 rows AND query 3b confirms the swap's exclusive lock is
still in place** — i.e., the moment the hard constraint is gone, the
advisory-lock mutex has already been protecting the swap side for the
entire duration since Migration A, per §4's ordering.

Also required per §8d's proof: an ACTUAL execution-order test isn't
possible without triggering a real concurrent swap, which this plan
does not propose doing as part of verification (too disruptive to
attempt deliberately against production). Confidence in §8d's
concurrency proof rests on `pg_advisory_xact_lock`'s documented
contract (§8f of the design doc), not on an observed live race — this
is stated plainly, not glossed over.

## 8. Test strategy given no local PostgreSQL (per ChatGPT's explicit instruction)

This project has no isolated Postgres instance — every schema change
in this repo's history has been verified against the real (or, for
Source Registry Phase 1, a genuinely separate staging TABLE within the
same Supabase project) production database directly, never a local
copy. This plan inherits that same constraint, honestly:

- **Structural verification (§7, queries 1–3)**: fully testable
  against production directly, since these are read-only catalog
  queries with no side effects.
- **Functional validation (§7, query 4)**: testable with a real
  editor-role write attempt using a deliberately fabricated `story_id`
  — low-risk (a rejected write leaves no trace), can be run directly
  against production.
- **Concurrency correctness (§8d of the design)**: **not empirically
  testable in this project** without either (a) building a genuinely
  isolated Postgres sandbox — out of scope for this plan — or (b)
  deliberately triggering a real race against production, which this
  plan explicitly does not propose. Confidence rests on
  `pg_advisory_xact_lock`'s documented semantics (a well-established,
  simple primitive with 15 years of stable behavior), not on an
  observed trace. This limitation is inherited from the design doc and
  restated here rather than silently assumed away.

## What this document does NOT do

- No migration executed, no FK dropped, no trigger created
- Does not pin the actual `bigint` lock-key literal (§2) — that's
  computed once at migration-writing time, not decided here
- Does not build any orphan cleanup mechanism (§5) — explicitly
  rejected, same as the design doc
- Does not touch `edition_story_classifications`
- Does not claim the concurrency design has been empirically tested
  (§8) — states the limitation plainly

## Next

Awaiting ChatGPT's review of this plan before §4's migration SQL is
written. Per the established discipline this session: design → plan →
migration script (written, not run) → test → production execution —
same sequencing already proven for Backend Control Plane Phase 1.
