# Migration C — Swap Reconciliation Fix, Design + Implementation Plan v1 (2026-08-17)

Status: `[x] Design+Plan` `[ ] Approved` — **read-only. No SQL written,
no production change.**

## 0. The bug, precisely

`repoint_story_clusters_fks()` (`db/schema-ingestion-staging-functions-v1.sql`,
called by `swap_ingestion_staging()` inside every atomic swap) still
carries its pre-Migration-B mental model: for `story_overrides`,
`saved_stories`, and `history_entries`, it drops whatever FK currently
exists that doesn't point at `story_clusters`, then **unconditionally**
re-adds `ADD CONSTRAINT ..._story_id_fkey FOREIGN KEY (story_id)
REFERENCES story_clusters(id)`. Migration B removed these 3 FKs by
design (replaced with the write-time trigger + advisory-lock boundary)
but never touched this function — so the very next swap silently
recreates exactly what Migration B removed. Confirmed live: after the
first real post-Migration-B swap, `old_fks_remaining` (per the same
verification query used throughout this session) read **3**, not 0.

**What this is not**: not a Migration A or B defect. Both did exactly
what they were designed to do. This is a **third, previously
unaudited caller** of the old FK model that Migration B's own scope
never covered — exactly why ChatGPT asked for a full consumer audit
before writing any fix.

## 1. Full audit — every place that assumes these 3 FKs exist (per ChatGPT's explicit instruction)

**Executable code** (the only category that can actually cause harm):

| Location | What it assumes | Needs Migration C to touch it? |
|---|---|---|
| `db/schema-ingestion-staging-functions-v1.sql::repoint_story_clusters_fks()` | Explicitly DROP+ADD's the FK for all 3 tables, every swap | **YES — this is the bug** |
| `ui/src/admin/reviewQueueAdapter.js::writeOverride()` | Surfaces whatever DB error message comes back (`error.message`) — no FK-specific error-code handling (checked directly, line 513: generic `throw new Error(...error.message)`) | No — already compatible with either FK-violation or the trigger's `RAISE EXCEPTION` message |
| `db/identity-test.js` (saved_stories/history_entries RLS + dedup test) | Inserts using real, live `story_id` values fetched at test setup — never tests FK-rejection behavior specifically, never asserts a particular error shape | No — passes unchanged either way |
| `db/drop-ingestion-old-tables.mjs::checkDangling()` | Queries `story_overrides`/`saved_stories`/`history_entries` for `story_id` not in live `story_clusters` — a functional check, not an FK assumption | No — this check is exactly the DB-level analog of what the FK used to guarantee, and remains correct/necessary regardless of whether a hard FK exists |
| `db/audit-orphan-editorial-state.mjs` | Same functional check, read-only | No |
| `db/editorial-fk-migration-static-audit.test.mjs` | Asserts Migration B's SQL drops these 3 FKs — already correctly reflects the POST-B state | No — but see §2, this test should gain one more assertion |
| `db/daily-observation.mjs` | Grep-checked: no FK-specific assumption found (mentions `saved_stories`/`history_entries` only in read-only observation counts) | No |

**Documentation** (historical/design records — not executable, flagged
for accuracy per ChatGPT's instruction, not functionally risky):
- `docs/pre-production-swap-verification-v1.md`, `docs/post-migration-observation-plan-v1.md`,
  `docs/content-pipeline-reliability-final-verification-v1.md`,
  `docs/classification-lifecycle-reconciliation-design-v1.md`,
  `docs/edition-architecture-model.md`, `db/schema-editorial-state.sql`,
  `docs/editorial-state-implementation-spec-v1.md`, `db/schema-identity.sql` —
  all predate Migration B and describe the FK as it existed at the time
  they were written. None of these are read by running code; they are
  historical design records. **Not touched by Migration C** — rewriting
  history here would be more misleading than leaving a dated record
  that was accurate when written. If a future reader needs the current
  state, `docs/editorial-state-orphan-lifecycle-design-v1.md` (this
  session's design doc) is the up-to-date source of truth and already
  says the FK model changed.

**Conclusion of the audit**: exactly ONE executable location needs to
change — `repoint_story_clusters_fks()` itself. Nothing else in the
codebase re-adds, assumes-present, or depends on the FK-specific error
behavior of these 3 constraints.

## 2. What Migration C changes

**Not** "add `IF NOT EXISTS`" (per ChatGPT's explicit rejection — that
would still carry the old mental model, just made idempotent instead
of correct). Instead: **remove the story_overrides/saved_stories/history_entries
blocks from `repoint_story_clusters_fks()` entirely.**

```
repoint_story_clusters_fks() — BEFORE Migration C
  ├── story_overrides block     (drop old FK, re-add pointing at story_clusters)  ← REMOVE
  ├── saved_stories block       (same)                                            ← REMOVE
  ├── history_entries block     (same)                                            ← REMOVE
  └── edition_story_classifications block (DELETE orphans, drop old FK, re-add)   ← KEEP, unchanged
```

**Why `edition_story_classifications` keeps its block**: unchanged
from every prior decision this session — it's machine-regenerated
projection data with no independent `expires_at`, correctly still
FK-enforced and correctly still needing its FK repointed to the new
`story_clusters` OID at every swap (a `RENAME` doesn't move incoming
FKs — the same original fact that made `repoint_story_clusters_fks()`
necessary in the first place, still true for this one table).

**Why the other 3 blocks can simply be removed, not replaced with
something else**: because Migration B's trigger
(`validate_editorial_story_reference()`) is not an FK — it doesn't
have an "incoming reference" that a table `RENAME` could break. It
resolves `story_clusters` by name at write time (per the design doc's
§8c "live" definition), and that resolution is correct against
whichever generation is currently live, automatically, with no
per-swap maintenance required. There is nothing for
`repoint_story_clusters_fks()` to do for these 3 tables anymore — not
"less to do," literally zero.

## 3. Migration C's SQL shape (illustrative — not written yet, per ChatGPT's explicit "jangan tulis SQL lagi")

```
CREATE OR REPLACE FUNCTION repoint_story_clusters_fks()
...
BEGIN
  -- story_overrides block:   REMOVED
  -- saved_stories block:     REMOVED
  -- history_entries block:   REMOVED
  -- edition_story_classifications block: UNCHANGED, copied verbatim
END;
$$;
```

Single `CREATE OR REPLACE FUNCTION`, same low-risk pattern already
used twice this session for functions in this exact file (the
FK-cycle-drop fix, and Migration A's own lock-line addition) — no
table structure changes, no data migration, purely a function-body
edit.

## 4. Static audit plan for Migration C (mirrors the discipline already used for A/B)

When the SQL is eventually written, the static audit must prove,
by parsing the file (no local Postgres, same constraint as A/B):
- The `story_overrides`/`saved_stories`/`history_entries` blocks are
  **absent** from the new function body (not just "not adding a new
  one" — literally gone).
- The `edition_story_classifications` block is **present and
  byte-for-byte unchanged** from the current committed version —
  exact-equivalence check, same technique used for Migration A's own
  proof (`db/editorial-fk-migration-static-audit.test.mjs`'s
  extract-body-and-diff approach), applied here to the ONE surviving
  block instead of the whole function.
- No other FK, table, or constraint outside `story_clusters`-adjacent
  ones is touched (scope guard, same as every prior migration this
  session).
- `swap_ingestion_staging()` itself (Migration A's lock line) is
  **not** touched by Migration C — this migration only edits
  `repoint_story_clusters_fks()`.

## 5. Sequencing — how Migration C fits with the FK that already came back

Per ChatGPT's explicit instruction, the order is:

```
Migration C design + plan    ← THIS DOCUMENT
        ↓
Migration C SQL written, static audit
        ↓
Migration C applied to production (repoint_story_clusters_fks() patched)
        ↓
Verify: repoint_story_clusters_fks() no longer contains the 3 blocks
        ↓
ONLY THEN: manually drop the 3 FKs that came back after the last swap
  (they are, right now, sitting in production again — re-created by
  the same bug this migration fixes; dropping them before C is applied
  would just have them recreated by the NEXT swap, an infinite loop)
        ↓
Verify: old_fks_remaining = 0 again, this time durably
        ↓
Run ONE more production ingestion cycle as the real test
        ↓
Verify old_fks_remaining STILL = 0 after THAT swap — this is the
  actual proof Migration C worked, not just that the FKs are gone
  once
```

**Why not drop the FKs first, then apply C**: because
`repoint_story_clusters_fks()` runs inside every swap unconditionally
— if any ingestion cycle happens between "FKs dropped" and "C applied,"
the bug recreates them again, and the team would be chasing the same
symptom in a loop. C must land first.

## 6. What this migration does NOT do

- Does not touch Migration A (`swap_ingestion_staging()`'s lock line) —
  separate function, separate concern
- Does not touch Migration B's trigger (`validate_editorial_story_reference()`)
  or the tables it's attached to
- Does not touch `edition_story_classifications`' FK or its cleanup logic
- Does not drop the FKs that already came back — that's a separate,
  explicit manual step AFTER C is verified (§5)
- Does not run a production ingestion cycle as part of applying C
  itself — that's the separate final verification step (§5)
- Does not rewrite historical documentation (§1)

## Next

Awaiting ChatGPT's review of this design + plan before any SQL is
written for Migration C.
