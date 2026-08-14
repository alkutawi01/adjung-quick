# Editorial System — Adversarial Audit v1 (2026-08-13)

Status: `[x] Partial — INCOMPLETE, quota exhausted mid-run` `[ ] Fixes applied`

Run before Pin, per ChatGPT: Pin is where humans start overriding automated
decisions, so the standard of proof is higher than for a normal feature.

Method: five reviewers over five dimensions, each finding then attacked by a
second agent whose job was to **refute** it — default verdict "wrong unless
proven from the actual code". Only survivors are listed.

## ⚠️ Read this before trusting any number below

**The audit did not finish.** The weekly usage limit was hit mid-run.

- **Audit 1** (precedence, authz, admin-ui, ranking, lifecycle): 35 agents, 24
  completed, **11 verification agents died**. The 12 findings below are
  genuinely confirmed. Findings whose verifier died are *unknown*, not clean.
- **Audit 2** (state convergence, expiry boundaries, conflict matrix): 23
  agents, **only 3 completed — all 20 verification agents died.**

**Audit 2's summary line reads `confirmed: 0, refuted: 20`. That number is
false, and the flaw is mine.** My workflow script computed
`refutedCount = total - confirmed`, so an agent that *failed to run* was
counted identically to an agent that *examined a claim and rejected it*. All
20 findings were raised by the analysis agents and then never verified by
anyone.

Reported prominently rather than buried, because it is the exact failure this
whole audit exists to catch — **a result that looks clean because the check
never ran.** Same shape as the three production bugs already found this phase.
Audit 2 must be re-run after the quota resets; its raw findings survive in the
workflow journal.

## Confirmed findings — Audit 1

Ordered by severity. All survived adversarial verification.

### HIGH

**1. `canPerformAction()` is never called anywhere — the admin-only boundary does not exist**
`db/editor-auth.mjs:47`

`db/schema-editorial-state.sql:97-104` states the Principle of Escalation is
"enforced at the APPLICATION layer... not by RLS". There is no such handler. A
repo-wide grep finds exactly two references: the definition and its unit test.
No production module imports it. `AdminApp.jsx:67`'s only gate is
`if (!isEditor(role))`, which admits `role='editor'` to the entire action
surface. Worse than first claimed: `role` never enters the component subtree at
all (`AdminApp.jsx:82` renders `<ReviewQueue userId={...} />`), so no descendant
could gate on it even if it tried.

Harmless *today* only by accident — every action currently exposed is
editor-legal, and no production code reads `override_type='pin'`. It becomes
critical the moment Pin merges. And the Pin planning docs actively mislead the
implementer: `pin-governance-design-v1.md:125` and
`pin-implementation-plan-v1.md:132` both say admin-only is "already enforced and
tested". Tested, yes — on a function nothing calls.

**Fix before Pin**: pass `role` down for the UI gate **and** enforce
`canPerformAction` inside `writeOverride()`, so a future caller cannot bypass it.
The UI gate alone would repeat the same one-layer mistake.

**2. RLS lets any editor forge, escalate, and destroy editorial state**
`db/schema-editorial-state.sql:105`

`story_overrides_editor_rw` tests only *membership* in `editors` — not
`override_type`, not `created_by = auth.uid()`, and not row ownership. With
`GRANT ... UPDATE` to `authenticated`, any editor with devtools can: insert
`override_type='pin'` (the CHECK already allows it); set `created_by` to someone
else's UUID, making the audit trail attacker-controlled; or `PATCH` every row at
once — e.g. `active=false` across the table, silently wiping all editorial
state.

**3. Reader projection omits `created_at`, so the most-recent-wins rule is inert**
`db/schema-public-active-overrides-view.sql`

`resolveStoryField()`'s conflict rule ("two competing overrides → newest wins")
is proven by unit tests and **does nothing in production**: the view I added
today doesn't select `created_at`, so every override arrives with
`created_at: undefined` and the sort is meaningless. `overrideId` is likewise
always undefined. My own bug, introduced today, and the same shape as everything
else this phase — a tested rule wired to nothing.

### MEDIUM

4. **Any active override marks a story "resolved" in the Review Queue —
   including `boost`, which resolves nothing.** `reviewQueueAdapter.js` — a
   boosted story with a genuine classification problem silently vanishes from
   the queue.
5. **Edition switch has no request sequencing.** `AdminApp.jsx` — a stale
   edition's queue can render under the new edition, and an action then writes
   an override against the **wrong edition**.
6. **`roleChecked` is never reset when the user changes.** `AdminApp.jsx` —
   every interactive sign-in briefly shows a false "no admin access" screen.
7. **Destructive-rebuild guard is blind to `story_overrides`** —
   `db/production-write-guard.mjs`, the third unprotected FK on
   `story_clusters`.
8. **Audit rows are rewritable in place, with no trace.**
   `schema-fix-editorial-state-grants.sql`.

### LOW

9. **Cold start bypasses the ranking-flag dispatch**, so boost overrides are
   ignored on the first screen. `App.jsx`.
10. **`public_active_overrides` publishes the full list of editorially
    suppressed stories to anonymous callers.** Also mine, from today. The view
    correctly withholds `reason`/`created_by`, but the *existence* of a hide is
    itself editorial information — anyone can enumerate what was suppressed.

## Classification (per ChatGPT's requested format)

| # | Class | Blocks Pin? |
|---|---|---|
| 1 | BUG (control documented but absent) | **YES — hard blocker** |
| 2 | BUG (authorization) | **YES** |
| 3 | BUG (silent no-op) | **YES** — pin conflicts need ordering |
| 4 | BUG | No — fix soon |
| 5 | BUG (data-corrupting) | No — but fix soon |
| 6 | BUG (cosmetic) | No |
| 7 | DESIGN GAP | No |
| 8 | DESIGN GAP | No |
| 9 | BUG | No |
| 10 | DESIGN GAP (disclosure) | Izzat's call |

## What must happen next

1. **Do not implement Pin yet.** Findings 1–3 are Pin's own foundations.
2. Fix 1, 2, 3 — then re-verify.
3. **Re-run Audit 2 after the quota resets.** Its "0 problems" is not a result.
4. Correct the two Pin docs that claim admin-only is already enforced.

## Note on the method

The audit found bugs in code written *today*, including two of my own (3 and
10). It also produced a false all-clear that would have passed unnoticed had the
failure counts not been checked. Both outcomes argue the same thing: adversarial
verification is worth its cost, and its *own* plumbing needs the same suspicion
it applies to the code.
