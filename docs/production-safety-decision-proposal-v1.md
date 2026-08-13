# Production Safety Decision Proposal v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` → **DECIDED 2026-08-13** `[x] Implementation pending` `[ ] Closed`

## Izzat's decision (2026-08-13)

> "setuju. lgpun quick ni cuma portal berita, bukan ada maklumat sensitif
> dan kritikal pun. jadi saya harap boleh autosave ke google drive pun
> dah cukup. lgpun hayat berita2 tu mungkin paling lama seminggu je.
> bukan sampai sebulan."

Approved: **stay on Supabase Free Plan, use free Google Drive sync as
the backup destination** instead of paying for Supabase Pro backups —
not a partial stopgap, a considered decision given the actual data
sensitivity (a public news portal, no sensitive/critical data) and
short content shelf-life (~1 week).

**Implemented**: `db/snapshot-production.mjs` now also writes a dated
copy (`production-snapshot-YYYY-MM-DD.json`) into `G:\My Drive\Adjung
Quick Backups\` (Google Drive for Desktop, already installed on this
machine — confirmed, zero new software/cost) — Drive's own sync client
uploads it to the cloud automatically. Old dated copies beyond 14 days
(double the ~1-week news lifespan) are pruned automatically so the
folder doesn't grow forever. Skips gracefully with a warning (not a
failure) on a machine without Drive mounted, since Izzat works across 2
computers.

**Supabase upgrade triggers (§1 below) still stand** — this decision is
about the FREE alternative for backup specifically, not a rejection of
ever upgrading. If real users start depending on `saved_stories`/
`history_entries`, that data (unlike news items) has no natural
short-lived rationale — worth revisiting then.

Per ChatGPT's post-launch direction: two real, disclosed gaps from
`docs/restore-rehearsal-v1.md` need an actual decision, not just a
"deferred" label sitting indefinitely. This document proposes concrete
triggers — **for Izzat to approve or reject**, not acted on
automatically. Nothing in this document has been executed.

## 1. Supabase upgrade trigger — proposed, not a single number

Per ChatGPT: don't pick one "upgrade at N users" threshold — the real
cost driver is risk, not raw traffic. Three independent triggers, any
one of which should prompt upgrading to Supabase Pro ($25/mo, unlocks
daily backups):

**Trigger A — Traffic**
Upgrade once daily active users become consistent (e.g. 100+ DAU) or
reading happens every day, not sporadically. Reasoning: infrastructure
cost should track actual usage.

**Trigger B — Data importance**
Upgrade *before* `saved_stories`/`history_entries` hold real,
meaningful user data — i.e. before real readers start actually saving
stories or building real history, not after. Currently both tables are
0 rows, so losing them today costs nothing; once real users depend on
them, losing them is a real trust failure.

**Trigger C — Operational dependency**
Upgrade before ingestion/classification start running unattended
(a real scheduled job, no human checking each run) — right now every
write this project has ever made was a manually-run script with a human
watching the output.

**Proposed decision** (Izzat to approve/reject):

> Current: Free Plan is acceptable for the v1.0 launch as-is.
> Upgrade required before any of: user data becomes valuable (Trigger
> B), automated production jobs begin running unattended (Trigger C),
> or traffic reaches sustained daily usage (Trigger A) — whichever
> comes first.

## 2. Restore strategy — proposed three-tier plan

**Tier 1 — Now (already in place)**
Manual local JSON snapshot (`db/snapshot-production.mjs`), versioned
metadata (snapshot date, ruleset version), gitignored. Status: accepted
temporary solution, covers data but not schema/RLS/Auth.

**Tier 2 — After real traction** (triggered by the same conditions as
§1 above, not a separate decision)
Add Supabase Pro, scheduled daily backups, and — importantly — an
actual restore rehearsal (something this project has never done,
`docs/restore-rehearsal-v1.md` §3).

**Tier 3 — At scale** (no trigger defined yet, deliberately — too far
out to plan concretely)
Automated backup verification, a written recovery runbook, a real
disaster-recovery test cadence.

**Proposed decision** (Izzat to approve/reject):

> Stay on Tier 1 until a Supabase upgrade trigger (§1) fires. Do not
> build custom backup infrastructure in the meantime — the local
> snapshot is the accepted stopgap, not a permanent solution to
> engineer around.

## 3. What this proposal does NOT authorize

Per ChatGPT, explicitly not done and not to be done without a separate,
explicit decision:

- ❌ Changing the Supabase plan (no upgrade performed)
- ❌ Building custom backup infrastructure
- ❌ Starting the RTM source precision audit
- ❌ Adding new source-intelligence scoring logic

All of the above can wait — this document is a decision proposal only.

## 4. What Izzat needs to actually decide

1. Approve or amend the three upgrade triggers in §1
2. Approve or amend the three-tier restore strategy in §2
3. Confirm: stay on Free Plan for now, revisit only when a trigger fires
