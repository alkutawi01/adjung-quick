# P0 — Classification Backlog Incident (2026-08-20)

Status: `[x] Found live` `[x] Root cause confirmed` `[x] P0-A recovered` `[x] P0-B implemented` `[x] Applied to production (ACTIVE)` `[x] Verified end-to-end on a real ingestion (CLOSED)`

## What happened

Izzat asked two questions about the live reader within minutes of each
other: why did the Nasional category show only 1 story, and why was a
Harian Metro PDRM tender story ("Kes tender PDRM: Sayed Amir Muzzakkir
minta sebahagian daripada RM19 juta fi perundingan Projek RMPNET")
showing as Disembunyikan with Kategori "—" and Kaedah "Tiada".

Both had the same root cause. The story had **no row at all** in
`edition_story_classifications` — running `understandStory()` on it live
classified it correctly (Crime 0.4 / Politics 0.4), proving the classifier
itself was fine. The story had simply never been run through it.

Measured, read-only, before any fix: of 686 live `story_clusters` (not
`expired`/`released`), only 278 had an `ms-MY` classification row — **408
(59%) were invisible to every reader.** A dry run of the real classifier
over those 408 showed 306 would become classified (Nasional alone: 1 →
57, matching the historical baseline of 61-63 from `db/observations/`).

## Root cause

`db/classify-production.js` only ever ran as a manual CLI command
(`--dry-run` / `--write`). Nothing in the repo calls it automatically —
`vercel.json` has no cron, there is no `.github/` workflow, and nothing
schedules it. Meanwhile `db/ingest-production.js` (also manually
triggered) kept adding new clusters. Classification simply never caught
up, and nothing surfaced that gap anywhere an editor would see it.

## P0-A — production recovery (done, 2026-08-20)

Izzat ran `node db/classify-production.js --write` himself (a real
production write requires his own explicit approval per this project's
standing rule, independent of any technical sign-off). Verified read-only
afterward: `edition_story_classifications` rows 278 → 543, Nasional 1 →
77, the PDRM story now classified as Jenayah, Hiburan 28 → 46 (also
cleaning up 7 stories from a misconfigured RTM feed that had been stuck
under Hiburan with stale classification data). 523/686 live clusters
(76%) now visible, up from 40%.

163 remained hidden after the recovery — expected, not a new problem:
roughly 61 are correctly-excluded English/Arabic content (belongs to
other editions), and ~70 are a genuine classifier vocabulary gap (mostly
two feeds, `rss-amanz` and `rss-rtm-sukan`), tracked separately, not part
of this incident.

## P0-B.1 / P0-B.2 — two gaps closed during adversarial review, before production

- **P0-B.1 (stale-generation guard):** the advisory lock above only
  serializes two *writes* — it says nothing about which one's underlying
  *compute* is stale. A slow manual `--write` computing against an older
  generation could still land its write cleanly after a newer automatic
  write, silently overwriting fresh data with stale results. Fixed:
  `replace_edition_story_classifications` now takes a second parameter,
  `p_expected_story_ids` (the caller's snapshot of active cluster IDs at
  compute time), and refuses the write if it no longer matches live
  `story_clusters` in either direction — checked inside the same
  advisory-locked transaction, no force-bypass.
- **P0-B.2 (pagination):** `computeClassificationRows()` read
  `story_clusters`/`rss_items` with plain unpaginated `.select()` calls,
  which PostgREST silently caps at ~1000 rows — the same cap this project
  has already hit on two other tables. Corpus was ~686/~741 at the time,
  not yet broken, but close enough that the next ingestion could silently
  truncate it with no human reviewing dry-run stats to notice. Fixed with
  a `selectAllChunked()` helper, same pattern already used in
  `ingest-production.js` and `reviewQueueAdapter.js`.

Both closed the same day, verified via real mutation-then-restore testing
plus an independent adversarial review agent, before the director signed
off P0-B for production.

## P0-B — prevent recurrence (implemented, applied to production 2026-08-20)

Per the director's explicit scope: fix the write path's atomicity, then
make classification run automatically without adding a second,
independently-scheduled process that could itself drift out of sync with
ingestion the same way classification already had.

1. **`db/schema-classification-atomic-replace-rpc-v1.sql`** (new) —
   `replace_edition_story_classifications(p_rows JSONB)`, a single
   Postgres function doing DELETE + INSERT in one implicit transaction.
   Replaces the old truncate-then-batched-upsert flow in
   `classify-production.js`, which made multiple separate HTTP requests
   with no client-side transaction spanning them — a batch failing
   partway through could leave the table with the delete committed and
   only some of the new rows written. Refuses an empty batch outright.

2. **`db/classify-production.js`** — refactored into
   `computeClassificationRows(client)` (read-only) and
   `writeClassificationRows(client, rows, {force})` (the atomic write,
   enforces `assertWriteAllowed()` itself). Added a row-count-drop floor:
   `writeClassificationRows()` refuses a write more than 50% smaller than
   the current row count unless `{force: true}` (CLI: `--force`) —
   closes the gap where a partial upstream failure could produce a small
   but non-empty `rows` array that would otherwise sail past the RPC's
   empty-only guard and silently wipe good data, now that no human
   reviews the dry-run stats before every write.

3. **`db/ingest-production.js`** — calls `computeClassificationRows()` +
   `writeClassificationRows()` automatically right after the post-swap
   parity check passes. A classification failure here does not suggest
   rolling back the swap (ingestion succeeded independently and is
   already correctly live) but exits non-zero so it's visible, and states
   that the previous classification data was left untouched.

4. **`ui/src/admin/reviewQueueAdapter.js`**'s `fetchClassificationBacklog()`
   + **`AdminDigest.jsx`**'s "Klasifikasi tertunggak" row — a standing
   warning indicator in the Admin Ringkasan panel, counting live clusters
   with zero classification row in ANY edition (not per-edition — a
   cluster correctly ineligible for one edition per the Edition
   Representation Eligibility Gate is not backlog). A fetch failure
   renders distinctly from "still loading" and, like a real backlog,
   suppresses the panel's "all clear" claim — this exact panel must never
   again say nothing needs attention while hundreds of stories are
   invisible.

Not built, per the director's explicit instruction: a second independent
scheduler (Vercel Cron / GitHub Action). Piggybacking on whatever already
triggers ingestion means classification is automatic for every existing
and future caller, with no second cron/secret/endpoint to keep in sync.

## Open question

Whether an out-of-repo scheduler for `ingest-production.js` itself exists
today (a server cron, a habit) is still unconfirmed. If one exists, P0-B's
hook makes classification automatic immediately. If not, ingestion itself
remains manually triggered — P0-B still closes the specific gap that
caused this incident (a human running ingestion without remembering the
separate classification step), and is not blocked on this answer.

## Production rollout (2026-08-20)

Izzat gave explicit approval and personally ran the migration in the
Supabase SQL Editor (this project's automation cannot write to production
SQL directly — every attempt is blocked by the harness's own safety
classifier, a standing limitation, not new). Verified read-only
afterward:

- `replace_edition_story_classifications(JSONB, TEXT[])` exists.
- `service_role` has `EXECUTE`; `anon`/`authenticated` do not.
- `edition_story_classifications` still had its original 686 rows,
  untouched (the migration is additive-only — `CREATE FUNCTION` +
  `REVOKE`/`GRANT`, no data statements).
- The live Vercel deployment already served the matching commit
  (`1512041`) — confirmed by comparing the served JS bundle hash against
  the local build, byte-identical. Admin backlog indicator renders
  correctly ("Klasifikasi tertunggak: 0").
- `node db/classify-production.js --dry-run` staged cleanly and stopped
  before swap; no classification hook output appeared, confirming the
  hook is correctly gated behind a real swap and never fires in dry-run.

## First real ingestion, second real bug found and fixed (2026-08-20, same night)

Izzat approved and ran a real ingestion. Staging+swap+parity all
succeeded (690 clusters, 747 items, exact match vs Lab) — but the
automatic classification hook failed:

```
replace_edition_story_classifications — DELETE requires a WHERE clause
```

Handled exactly as designed: ingestion stayed live and correct, no
partial write (the atomic RPC's DELETE never began), previous
classification data untouched, non-zero exit with a clear message naming
the manual recovery path (`node db/classify-production.js --write`).

**Root cause** (medium-high confidence — no live Postgres access to
confirm directly): this Supabase project's Postgres refuses ANY
unqualified DELETE/UPDATE, most likely a guard similar to the
`pg-safeupdate` extension. Not found as a registered extension in
`pg_extension` (checked); `shared_preload_libraries` includes
`plan_filter` and `pg_tle`, either of which could implement this without
a `pg_extension` row. Strong corroborating evidence: the only two OTHER
`DELETE` statements against this exact table anywhere in the codebase
(`migration-C-swap-reconciliation-fix-v1.sql`,
`schema-ingestion-staging-functions-v1.sql`) already carried a real
`WHERE` clause — this RPC's `DELETE` was the only unqualified one in the
entire codebase, and the only one that had never run against real
production before that night. This is exactly the gap the "no live
Postgres available" test constraint (stated throughout this project's
test suite) warned about — a fake-client test cannot catch a real
Postgres-level guard.

**Fix**: `DELETE FROM edition_story_classifications WHERE true;` — a
syntactic no-op (matches every row, functionally identical to no `WHERE`
at all), satisfying the guard without changing behavior. Static audit
updated to assert the `DELETE` is not scoped by `edition_id` (the real
property that matters) AND that it literally contains `WHERE true`
(proves the fix is present, not silently reverted). Mutation-tested by
hand and independently re-verified by an adversarial review agent, which
also confirmed no other unqualified `DELETE`/`UPDATE` exists anywhere
else in the codebase.

Izzat re-applied the migration and ran `node db/classify-production.js
--write` directly — succeeded (691 rows, ms-MY 97% classified, Nasional
86 up from 1). This proved the underlying fix worked, but via the
*manual* path, not the automatic hook (whose only real attempt that night
was *before* the fix was deployed) — an honest gap flagged to the
director rather than declaring victory early.

## Second and third real ingestions — automatic hook proven (2026-08-20)

Per the director's explicit instruction ("jangan ubah lagi, tunggu satu
ingestion biasa"), Izzat ran two more ordinary ingestions without any
code changes in between. Both hit the single-generation swap guard
(`a previous _old generation still exists`) — expected: every successful
swap preserves its own `_old`, so each subsequent swap needs that
generation retired first, same as the original migration-era artifact.
Each time, re-verified the automatable checks read-only (row counts sane,
zero dangling references) before asking Izzat's separate explicit
approval to drop, exactly the same disciplined process as the original
migration-era `_old` retirement — never batched or assumed from an
earlier approval.

On the third attempt, with nothing else changed since the `WHERE true`
fix: staging (693 clusters, 746 items) → swap committed → parity PASSED
→ **automatic classification hook ran on its own, no manual
intervention** → `✓ Classification complete: 695 rows written (atomic
replace).` Verified live: Admin backlog indicator reads 0 on the new
generation (554 processed).

**Status: CLOSED.** The exact sequence the incident needed to prove —
`ingest-production.js` → swap → parity PASS → `computeClassificationRows()`
→ `writeClassificationRows()` → `replace_edition_story_classifications()`
→ classification updated — completed end-to-end automatically, with zero
manual recovery, exactly as P0-B was designed to guarantee.
