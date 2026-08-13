# Restore Rehearsal v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[x] Implementation pending` `[ ] Closed`

Category: **Post-launch operations**. Priority 2 per ChatGPT's
post-launch sequence (after monitoring), directly following the
long-standing open gap: *"has a backup ever been proven restorable?"*
(`docs/launch-candidate-review-v1.md` §3, accepted as a known risk under
Option A).

## 1. What was actually checked (not assumed) — 2026-08-13

Checked the real Supabase dashboard for this exact project
(`njjiuhfsnlvjosiqozmn`, "Adjung Quick"), not inferred from memory:

- **Database → Backups → Scheduled backups**: *"Free Plan does not
  include project backups."* Confirmed live in the dashboard — this
  project is on the Free Plan, and Supabase provides **zero** automatic
  backups at this tier. Not "unreliable backups" — literally none.
- **Database → Backups → Point in Time Recovery**: Pro Plan add-on,
  starts at **$100/month**, separate from the Pro Plan itself.
- **Pro Plan** (which would unlock daily backups at no extra cost
  beyond the plan itself) — not currently subscribed.

**This sharpens what was previously written as "no reliable DB backups
exist" — the accurate statement is "no DB backup of any kind exists."**

## 2. What DOES exist today (the only real safety net)

`db/snapshot-production.mjs` — a read-only, local, gitignored JSON
export, covering:

```
sources                          (43 rows)
story_clusters                   (865 rows)
rss_items                        (917 rows)
edition_story_classifications    (867 rows)
```

This is **not a database backup**. It captures data, not schema — no
table structure, no RLS policies, no indexes, no triggers, no Auth
users. If the Supabase project itself were lost or corrupted, this
snapshot alone could not restore a working system; it could only
re-seed data into an already-correctly-structured empty database.

**Gap found during this check**: the snapshot script does not cover
`saved_stories` or `history_entries` (the Identity Layer's user data
tables). Currently harmless — both are 0 rows (no real users yet, not
publicly launched) — but this must be added before real user data
exists in those tables, or a restore would silently lose every reader's
saved stories/history with no export to recover from.

## 3. Why a full restore rehearsal isn't safely possible right now

A genuine rehearsal (break something, restore it, confirm it works)
needs either:

- A disposable environment to break on purpose — **doesn't exist** (no
  staging database, `docs/staging-environment-setup-plan-v1.md`'s
  explicit, deliberate decision), or
- A real backup to restore FROM — **doesn't exist** (§1 above)

Attempting a "rehearsal" against the single shared production database
with no real backup to fall back on would be the destructive-testing
risk Izzat has already flagged as a standing concern this project
(`feedback_adjung_core_test_carefully` — no reliable DB backups exist,
verify before testing destructively). **Not attempted, on purpose.**

## 4. What's realistic at zero added cost, done now

1. **Extend `db/snapshot-production.mjs`** to also export
   `saved_stories` and `history_entries` (schema-ready even though
   currently empty) — closes the gap found in §2 before it matters.
2. **Document the actual schema** (table structure, RLS policies) via
   `pg_dump --schema-only`-equivalent or Supabase's own schema export,
   stored alongside the data snapshot — so a from-scratch rebuild is
   theoretically possible (data + schema together), even without a
   paid backup product.
3. **Increase snapshot frequency** — currently manual, run on-demand.
   At minimum, re-run before any risky operation (already the practice
   this session: re-run before the launch deploy).

## 5. What requires a real decision (not free)

**Recommendation: upgrade to Supabase Pro ($25/month) once real reader
traffic exists.** This single change would:

- Enable daily automatic backups (7-day retention) — the actual "can we
  recover from a real disaster" answer
- Not require PITR ($100/mo add-on) to get meaningful protection —
  daily backups alone are a large improvement over the current zero

This follows the exact same trigger Izzat set for staging
(`docs/staging-environment-setup-plan-v1.md`: *"Bila pengguna sebenar
dan trafik meningkat, baru pertimbangkan..."*) — not a recommendation
to spend now, but the concrete number to revisit against once that
trigger fires.

## 6. Honest summary

| Question | Answer |
|---|---|
| Does a real backup exist today? | **No** — confirmed via dashboard, Free Plan excludes it entirely |
| Has restore ever been tested? | **No**, and can't be safely tested without a real backup or disposable environment |
| Is there ANY safety net? | Yes, partial: local data-only snapshot (`db/snapshot-production.mjs`), covers 4 of 6 known tables, no schema |
| What closes this gap for free? | Extend the snapshot to cover all tables + export schema alongside it |
| What actually solves it? | Supabase Pro ($25/mo) — deferred until real traffic, per Izzat's own standing cost trigger |

Not closed — recorded honestly as a real, disclosed, currently-accepted
risk (per Option A), not silently treated as solved by the local
snapshot's existence.
