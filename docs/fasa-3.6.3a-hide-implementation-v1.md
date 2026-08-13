# FASA 3.6.3a — Hide Action: Implementation Report (2026-08-13)

Status: `[x] Implemented` `[x] Tested` `[x] Verified live` `[ ] Closed (pending ChatGPT review)`

Per ChatGPT's exact scope: Hide only. Resolver integration, human-first
admin UI, 4 mandatory tests. Explicitly not reclassify enhancement,
boost, pin, source override, or a history screen.

## What was already there vs. what this phase actually built

Fasa 3.6.2 already gave the admin a way to WRITE a hide override
(`story_overrides`, `override_type: 'hide'`, reason required). What was
missing — and is the real substance of 3.6.3a — was the READ side: a
reader visiting Adjung Quick had no path that ever looked at
`story_overrides` at all. A hide/reclassify decision sat in the
database with zero effect on what anyone actually saw.

## 1. Resolver integration (`ui/src/adapter/productionAdapter.js`)

`fetchRankedQueue()`/`mapRowsToRankedQueue()` now fold in active
overrides via the SAME `resolveStoryField()` FASA 3.6.1 already built
and tested (`state/editorialStateResolver.mjs`) — reused, not
reimplemented. A hidden story gets `topic: null`, reusing the exact
mechanism an unclassified story already had (never matches any Bidang,
never enters `selectActiveSet()`'s candidate pool) — hide beats ranking
structurally, because ranking never sees the story, not because of a
separate check layered on top.

## 2. Two real production bugs found and fixed along the way

Wiring this up surfaced two genuine, previously-latent bugs in the
Fasa 3.6.1 schema — not hypothetical, both hit live against production:

**Bug 1 — RLS infinite recursion.** `editors`' own SELECT policy
checked admin status with a subquery against `editors` from inside
`editors`' own policy, which Postgres re-evaluates recursively until it
hits its recursion-depth guard. Never observed during 3.6.1 because an
admin checking their own row short-circuits past the recursive branch;
first hit by an anonymous session (the reader client), which always
takes the recursive path. Fixed via `db/schema-fix-editors-rls-recursion.sql`
— a `SECURITY DEFINER` `is_admin()` helper that breaks the cycle
(Supabase's own documented pattern for this exact class of bug). Also
fixed the same latent flaw in `editors`' insert/delete policies while
in there, since they shared the identical structure.

**Bug 2 — no anon read path at all.** Once recursion was fixed,
`story_overrides` correctly denied the anonymous reader (by design —
signed-in editors only). This was the deferred "later step" already
named in `db/schema-editorial-state.sql`'s own comment. Fixed via
`db/schema-public-active-overrides-view.sql` — a narrow view
(`public_active_overrides`) exposing only `story_id/edition_id/
override_type/new_field` for `active = true` rows, granted to `anon`.
Deliberately NOT a broad grant on the base table, which would also
expose `reason`/`created_by` (an editor's note, an `auth.users`
reference) to direct REST queries — least-privilege, matching this
project's existing posture.

Both were run against production with Izzat's explicit confirmation
(the platform's own action classifier requires this for any live DDL;
both migrations are additive — no table dropped, no data touched).

## 3. Human-first admin UI

`ReviewQueueCard.jsx`'s Hide flow now shows the explicit confirm
sentence ChatGPT specified before the admin commits: "Berita ini tidak
akan muncul kepada pembaca." — never technical language like
`hidden=true`.

## 4. Test wajib — all 4, plus the full existing suite

New: `db/editorial-override-reader-integration.test.mjs` (8
assertions), wired into `npm test`:
- **Test 1** — hide exists → reader excludes (topic: null)
- **Test 2** — recompute (refresh) → still excluded
- **Test 3** — hidden story has the HIGHEST editorial_score of the
  fixture → still excluded, proving hide beats ranking regardless of
  score, not by coincidence of a low score
- **Test 4** — override absent from the active set (undo/deactivate) →
  story reappears under its classifier field

Also added `deactivateOverride()` to `reviewQueueAdapter.js` (soft
update, `active → false`, never a delete — the row remains the audit
trail) so the undo mechanism Test 4 models is real and callable, even
though no UI surface calls it yet (no History screen, per scope).

Full suite: 13 files, 0 failures (up from 12/0 before this phase).

## 5. Verified live

Dev server against real production Supabase — reader app (`/`) loads
cleanly post-fix in a fresh tab (zero console errors), edition
switching (ms-MY → en-global) still works, admin `/admin` unaffected.
Confirmed via `information_schema.role_table_grants` that
`public_active_overrides` has `SELECT` granted to `anon` in production.

## What this phase does NOT do

Per ChatGPT's explicit scope: no reclassify enhancement, no boost, no
pin, no source override, no history screen. `story_overrides`'
`new_field` column already flows through `resolveStoryField()` for
reclassify too (since it's the same shared function 3.6.1 built) — that
is an existing side effect of reusing the resolver, not new work done
for reclassify specifically; 3.6.3b will give it its own explicit
review.
