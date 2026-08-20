# P0 — Classification Backlog Incident (2026-08-20)

Status: `[x] Found live` `[x] Root cause confirmed` `[x] P0-A recovered` `[x] P0-B implemented` `[ ] Applied to production`

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

## P0-B — prevent recurrence (implemented, not yet applied to production)

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
