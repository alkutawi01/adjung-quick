# Editorial Action Verification Standard v1 (2026-08-13)

Status: `[x] Standard locked` `[x] Applied to Hide` `[x] Applied to Reclassify`

Category: **[DECISION] operating standard.** Written in response to a
real incident, not as process for its own sake.

## The incident this exists because of

Fasa 3.6.2's Admin UAT was reported PASS by Izzat in good faith. A later
database check found `story_overrides` had **zero rows** — no editorial
action had ever actually persisted. The base Postgres `GRANT` for the
`authenticated` role was missing on `editors`/`story_overrides`/
`source_overrides` (RLS policies alone are not sufficient; RLS restricts
*on top of* a GRANT, and without one Postgres rejects with `42501`
before RLS is evaluated). The UI never surfaced the failure.

## The principle

> **UI success is not proof of persistence.**

An editorial action passes through four distinct layers. A UAT that only
observes the first one proves almost nothing about the other three:

```
1. UI action           — the admin clicked, the card disappeared
        ↓
2. Auth permission     — the role check actually resolved
        ↓
3. Database write      — a real row exists, with correct values
        ↓
4. Reader projection   — a reader's own query actually sees the effect
```

## The standard — every editorial action, every time

An editorial action may only be called verified when **all applicable**
layers are confirmed with direct evidence:

| # | Layer | What counts as evidence |
|---|---|---|
| 1 | **UI action** | The flow completes; the card leaves the active queue |
| 2 | **Auth role** | The `editors` role query returns the expected role for the real account (HTTP 200 + role, not just "no visible error") |
| 3 | **Database row** | A direct `SELECT` against the table shows the row, with `override_type`, `edition_id`, target field, `reason`, and `created_by` all correct |
| 4 | **Reader projection** | A query made *as the reader would* (anonymous, via `public_active_overrides`) returns the override |
| 5 | **Undo** (where applicable) | Deactivating restores prior behaviour, and the row survives as audit trail |

**A human's report of layer 1 is not a substitute for layers 2–5.** This
is not a comment on Izzat's UAT — it's a statement that no human clicking
a UI can observe what a database stored. The two are different questions
and need different evidence.

## Applies to

Every current and future editorial action: hide, reclassify, and — when
built — boost, pin, and source overrides. Boost and pin will additionally
need ranking-behaviour evidence (they alter the ranking contest itself,
which layers 1–5 don't cover); that is an *addition* to this standard,
never a replacement.

## Production verification results — 2026-08-13

Both actions re-verified against production **after** the GRANT fix.

### Reclassify — PASS (all 5 layers)

| Layer | Result |
|---|---|
| 1 UI | Flow completed, story left the active queue |
| 2 Auth | `editors` returned HTTP 200 `[{"role":"admin"}]` |
| 3 DB row | `edition_id: ms-MY`, `override_type: reclassify`, `new_field: Nasional`, reason + `created_by` populated |
| 4 Reader | `public_active_overrides` returned the override to an anonymous request |
| 5 Undo | Set `active: false`; row retained as audit trail |

### Hide — PASS (all 5 layers)

Re-verified rather than assumed — the original hide work predates the
GRANT fix, so its earlier "verification" was subject to the same false
positive.

| Layer | Result |
|---|---|
| 1 UI | Confirm copy shown ("Berita ini tidak akan muncul kepada pembaca."), flow completed, story left the active queue |
| 2 Auth | `editors` returned HTTP 200 `[{"role":"admin"}]` |
| 3 DB row | `edition_id: ms-MY`, `override_type: hide`, `new_field: NULL`, reason + `created_by` populated |
| 4 Reader | `public_active_overrides` returned the hide to an anonymous request; a real `fetchRankedQueue('ms-MY')` call resolved that story to `topic: null` — unreachable from any Bidang, out of 896 clusters |
| 5 Undo | Set `active: false`; row retained as audit trail |

Both test rows were deactivated afterwards — they were verification
artifacts, not Izzat's editorial decisions, and shouldn't sit in
production as if they were.

## A third bug this verification round caught

Re-running the admin flow repeatedly (which the old, UI-only UAT never
did) exposed an intermittent hang: `/admin` would stick on
"Memuatkan..." indefinitely. Root cause in `AdminApp.jsx`: the role-check
effect was keyed on the `session` **object**, and `onAuthStateChange`
fires repeatedly (`INITIAL_SESSION`, `TOKEN_REFRESHED`, …) with a new
object each time for the same user — so the effect re-ran and reset
`roleChecked` to `false` on every event, while supabase-js holds an
internal auth lock during that callback, so the resulting query could
stall waiting on a lock the callback still held. Fixed by keying the
effect on `session?.user?.id` (a primitive — a token refresh for an
already-checked user is now a no-op) and deferring the query out of the
auth-callback call stack. Verified stable across repeated reloads.

This is exactly the class of bug a single happy-path click-through
cannot find, and is part of why this standard exists.

## Status corrections this forced

| Phase | Was | Now |
|---|---|---|
| 3.6.1 Foundation | PASS | PASS **after GRANT fix** — the original bootstrap check passed through a path that couldn't actually write |
| 3.6.2 Review Queue | PASS (UAT) | PASS **after correction** — UI verified originally; persistence only verified 2026-08-13 |
| 3.6.3a Hide | PASS | PASS **after re-verification** under this standard |
| 3.6.3b Reclassify | — | PASS — first phase verified under this standard from the start |

## What this standard does NOT do

- Does not add automated tooling to enforce itself — it's a checklist
  applied by whoever verifies, deliberately lightweight
- Does not replace the automated test suite, which covers logic; this
  covers *production reality*, which tests structurally cannot
- Does not add process to non-editorial work (reader UI, classification
  calibration) — this is specifically for actions that write human
  editorial decisions into production state
