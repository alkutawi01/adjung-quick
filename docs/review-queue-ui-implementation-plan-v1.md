# Review Queue UI Implementation Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[x] Implementation pending` `[x] Closed`

## Implemented 2026-08-13

Built exactly per this plan: `ui/src/admin/adminSupabase.js`,
`reviewQueueAdapter.js`, `AdminApp.jsx`, `ReviewQueueCard.jsx`; wired at
`/admin` via a path check in `main.jsx` (no router added). `npm test`
still 0 failures (78 assertions, unchanged suites).

**Verified live** (dev server, real production Supabase):
- `/admin` renders the sign-in form; `/` (reader) unaffected
- Sign-in POSTs to the real Supabase Auth backend — tried a bad
  password, got back a real `Invalid login credentials` error rendered
  in the form, proving the wiring is real, not stubbed
- Mobile viewport (375px) — form and intended card layout hold up
- **Real bug found and fixed during this verification**: `main.jsx`
  statically imports both `App.jsx` (→ the reader's Supabase client)
  and `AdminApp.jsx` on every page load, since ES imports run at
  module-eval time regardless of which route renders. Both clients
  defaulted to the same Supabase storage key, and the console showed a
  real "Multiple GoTrueClient instances... same storage key" warning
  on `/admin`. Fixed by giving each client its own explicit
  `storageKey` (`adjung-quick-admin-auth` / `adjung-quick-reader-auth`)
  — confirmed gone after the fix, verified again on both routes.

**NOT verified live — cannot be, by Claude**: the actual
signed-in-editor path (queue renders, hide/reclassify writes a real
override). That needs Izzat's own account
(`alkutawi01@gmail.com`/`admin`, per
`docs/editor-bootstrap-runbook-v1.md`) and his own password, which
Claude does not have and is not permitted to enter on his behalf. Every
other layer up to that point (routing, auth call, error handling,
role-gate code path, query/write logic reviewed against the schema) is
in place and tested short of that one step.

## Status per ChatGPT (2026-08-13): Human Acceptance Pending

ChatGPT's explicit decision after reviewing this report: 3.6.2 stays
🟡 (implementation done, NOT closed) until Izzat completes a short Admin
UAT himself — this is the one step no automated test can substitute
for, since it exercises the real chain
`Izzat → Supabase Auth → AdminApp → Review Queue → override write →
reader behaviour`, ending in a real human, not a mock.

**Admin UAT (Izzat, ~5 minutes)**:
1. Open `/admin`, sign in with the admin account
2. Confirm the queue appears, a story opens, and the wording is
   understandable
3. Try one action (Ubah bidang or Sembunyikan)
4. Confirm: the override row exists, and the reader-facing app reflects
   the decision

Only after this UAT passes does 3.6.2 close and 3.6.3 begin.

**UAT result (Izzat, 2026-08-13): reported PASS — later found to be a
FALSE POSITIVE.** Izzat reported in good faith that sign-in worked, the
queue appeared, and an action saved. A later database check (during
3.6.3b) found `story_overrides` had **zero rows** — no override write
had ever actually reached the database.

**Root cause**: `editors`/`story_overrides`/`source_overrides` were
created in 3.6.1 with RLS *policies* but no base Postgres `GRANT` for
the `authenticated` role. In Postgres, RLS restricts on top of a base
table GRANT; without the GRANT, every query fails with `42501
permission denied` before RLS is even evaluated. So no signed-in
editor — including Izzat's own admin account — could read `editors` or
write `story_overrides` through the app. Fixed in
`db/schema-fix-editorial-state-grants.sql`.

**Why the UAT wasn't a reliable check, and what replaced it**: a
human clicking through a UI can only report what the UI showed them.
The lesson recorded here is that "the admin says it worked" must be
paired with a direct database-side confirmation of the row, which is
now how every editorial action is verified. Re-verified end-to-end
after the grant fix: a real reclassify write produced a real
`story_overrides` row (`edition_id: ms-MY`, `override_type:
reclassify`, `new_field: Nasional`), visible through
`public_active_overrides` to the anonymous reader client. FASA 3.6.2 is
closed on that evidence, not on the original UAT report.

## Next (per ChatGPT, sequenced by risk — not to be reordered)

**FASA 3.6.3 — Editorial Actions**, one sub-phase at a time:
- **3.6.3a — Hide** (simplest: `story_override` → resolver → reader
  doesn't see it)
- **3.6.3b — Reclassify** (admin picks a field → override → reader sees
  it under the new Bidang)
- **3.6.3c — Boost** (touches the ranking pipeline — higher risk)
- **3.6.3d — Pin** (last: bypasses ranking selection entirely — highest
  risk)

Source overrides are explicitly NOT started until the story-level
actions above are stable in production.

Category: **[DECISION] implementation plan.** Fasa 3.6.2. Per ChatGPT:
answer data source, lifecycle, v1 action scope, and mobile layout before
writing UI code.

## 1. Source data — direct query, not a re-run of classification

**Correction to `docs/review-queue-spec-v1.md`'s original framing**:
that spec assumed reusing `db/classification-observatory.mjs`'s
detection *logic*. On inspection, the observatory re-runs the full
classifier per story (a from-scratch analysis tool, fine for a CLI
report). A live browser UI querying that way would be slow and
duplicate work `db/classify-production.js` already did.

**What's actually reused: the already-computed *results*.**
`edition_story_classifications` already stores `classification_status`
and `classification_confidence` for every story, written once by
`classify-production.js`. The Review Queue queries that table directly:

```sql
SELECT story_id, field, classification_confidence, classification_status
FROM edition_story_classifications
WHERE edition_id = :edition
  AND (classification_status = 'unclassified' OR classification_confidence < 0.5)
```

Joined with `story_clusters`/`rss_items` for title/source (same shape
`productionAdapter.js` already reads), and **excluding any story with
an active `story_overrides` row** (already resolved — see lifecycle
below).

### `reason_code` mapping — v1 scope

| `reason_code` | Query condition | v1? |
|---|---|---|
| `low_confidence` | `classification_confidence < 0.5` | ✅ |
| `no_evidence` | `classification_status = 'unclassified'` | ✅ |
| `content_mismatch` | Requires per-story evidence data | ❌ **deferred** |
| `manual_flag` | Requires actions to exist first | ❌ **deferred** |

**`content_mismatch` deferred, disclosed not silently dropped**: the
observatory's "possible mismatch" detection depends on Tier-5 evidence
(`understanding.subject_candidates`) that `classify-production.js`
computes but never persists — only the final resolved `field` is
stored. Surfacing this in the live queue would need
`classify-production.js` to also write that evidence
(`edition_story_classifications.evidence` or similar), a real but small
schema/pipeline change, not done here. v1 ships without it rather than
recomputing classification client-side.

## 2. Queue lifecycle

```
Detected           → a story matches a reason_code condition above
       ↓
Pending Review      → shown in the active queue
       ↓
Resolved            → an active story_override exists for this story+edition
       ↓
(removed from active queue; the override row IS the audit trail)
```

**Resolved items do not reappear in the active queue.** The query's own
"no active override" condition handles this naturally — no separate
"resolved" flag needed. History isn't lost: the override row itself
(`docs/editorial-state-implementation-spec-v1.md` §3) is the permanent
record of what was decided and why, queryable any time, just not
cluttering the active queue.

## 3. v1 action scope

Per ChatGPT: **hide and reclassify only.**

- ✅ **Sembunyikan** (hide) — writes `story_overrides`, `override_type: 'hide'`
- ✅ **Ubah bidang** (reclassify) — writes `story_overrides`, `override_type: 'reclassify'`
- ⏸ Boost, Pin — deferred (already touch the ranking pipeline, per
  `docs/editorial-action-spec-v1.md`'s Principle of Escalation — bigger
  blast radius, not v1)
- ⏸ Source overrides — deferred (cross-edition, `admin`-only, separate
  UI surface entirely — not a per-story queue action)

"Terima" (confirm system's own suggestion) is **not offered in v1**
either — the system doesn't currently suggest a specific replacement
Bidang for `unclassified`/`low_confidence` stories (that would require
the same undone evidence-persistence work as `content_mismatch`
above). v1's "Ubah bidang" opens a plain picker with no pre-filled
suggestion — an honest v1, not one that fakes a suggestion.

## 4. Mobile-first layout

Per ChatGPT and Izzat's own stated context (busy, phone-first): one
card, one story, one decision.

```
┌─────────────────────────────┐
│ [Story title]                │
│ [Source name]                │
│                               │
│ Kenapa muncul:                │
│ [display_reason]              │
│                               │
│ [ Ubah bidang ]  [ Sembunyikan ]│
└─────────────────────────────┘
```

No table, no columns, no sort/filter UI in v1 — a vertical list of
cards, same visual language as the reader-facing `StoryCard` component
(reused CSS patterns, not reinvented).

## 5. Auth gate

Per `docs/admin-auth-spec-v1.md`: the admin surface lives at a separate
route (`/admin`, since this project has no router dependency — a
top-level path check in `main.jsx`, not a new library). On load: sign
in via Supabase Auth (already-existing flow, `persistSession: true` for
this surface specifically — the reader client deliberately uses
`persistSession: false`, a *different* client instance for `/admin`) →
check `editors` via `getEditorRole()` → show the queue if `editor` or
`admin`, otherwise show "tiada akses" and nothing else.

## What this plan does NOT do

- Does not implement `content_mismatch`/`manual_flag` detection
- Does not implement boost/pin/source-override actions
- Does not add a router library — a single path check is sufficient for
  one admin route
- Does not change `classify-production.js` to persist evidence (the
  real fix for `content_mismatch`, a separate future task)

## Next

Implementation, following this plan exactly. Verify live (real login,
real queue entries, real hide/reclassify write) before considering
3.6.2 done.
