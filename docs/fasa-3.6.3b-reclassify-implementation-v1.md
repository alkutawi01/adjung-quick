# FASA 3.6.3b — Reclassify: Implementation Report (2026-08-13)

Status: `[x] Implemented` `[x] Tested` `[x] Verified live end-to-end` `[ ] Closed (pending ChatGPT review)`

Plan: `docs/reclassify-action-plan-v1.md` (written first, per ChatGPT's
"jangan implement dahulu sehingga plan siap").

## The important finding: the 3.6.2 UAT was a false positive

While verifying reclassify, a database check showed `story_overrides`
had **zero rows** — meaning Izzat's earlier Admin UAT "PASS", and by
extension part of 3.6.1's bootstrap verification, had never actually
written anything. Reported in good faith; the UI simply didn't surface
the failure.

**Root cause (predates today's work, from 3.6.1's own migration)**:
`editors`, `story_overrides`, and `source_overrides` were created with
RLS *policies* but no base Postgres `GRANT` to the `authenticated`
role. RLS is a restriction layered on top of a table-level GRANT — with
no GRANT, Postgres rejects with `42501 permission denied` before RLS is
ever consulted. Every carefully-written policy was therefore
unreachable. Fixed in `db/schema-fix-editorial-state-grants.sql`
(3 GRANT statements, no policy or data touched).

**Process lesson, recorded so it isn't relearned**: a human UAT
confirms what the UI *showed*, not what the database *stored*. Every
editorial action from here is verified with a direct row check, not a
UI impression.

## What 3.6.3b actually changed in code

Small, because the plan (§2, §3, §4) found most of the behaviour was
already correct by construction and needed verification, not new code:

- `ReviewQueueCard.jsx` — added ChatGPT's mandated confirm copy to the
  reclassify flow: **"Letakkan berita ini di bidang lain."** (never
  "Override classification"), matching the pattern Hide already uses.
- `db/editorial-override-reader-integration.test.mjs` — extended from
  8 to 13 assertions with reclassify-specific coverage (Tests 5–7).

Everything else the plan verified as already-satisfied: story-level
scope, what gets stored (3.6.1's schema already correct — the classifier
row is never overwritten), `hide > reclassify` precedence (already
proven in `editorialStateResolver.test.mjs`), and reversibility
(`deactivateOverride()` from 3.6.3a, reused unchanged).

## Tests

| Test | What it proves |
|---|---|
| 5 / 5b | Reclassify is edition-scoped — a ms-MY override leaves the same story's en-global placement untouched |
| 6 | Reclassify does not alter `editorialScore` — it changes which Bidang a story competes in, never the score it competes with (ranking algorithm untouched) |
| 7 / 7b | Reversible — deactivating the override reverts the story to its classifier field |

Full suite: 13 files, 0 failures.

## Verified live, end-to-end, against production

Not a UI impression this time — the actual chain, each link confirmed:

1. `editors` role check returns HTTP 200 `[{"role":"admin"}]` for
   Izzat's real account (was `403 permission denied` before the grant
   fix — this is the first time it has ever genuinely worked)
2. The Review Queue renders real production stories with plain-Malay
   reasons
3. A real reclassify was submitted through the UI
4. **Database confirms the row**: `edition_id: ms-MY`, `override_type:
   reclassify`, `new_field: Nasional`, with reason and `created_by`
   populated
5. The story dropped out of the active queue (Resolved lifecycle)
6. `public_active_overrides` returns that override to an anonymous
   (reader) request — the reader-side resolution path confirmed live,
   not just unit-tested

The test row was then deactivated (`active: false`), leaving the row
itself intact as audit trail — which also exercised the undo path
against real data.

## Out of scope, untouched

Boost, pin, source override, classifier rules, ranking algorithm,
taxonomy, history screen.
