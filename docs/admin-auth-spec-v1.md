# Admin Authentication Spec v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] spec. No auth config, table, or code built here.**
Fasa 3.2. Answers: who can log in as an admin, what role do they have,
how does the system tell an admin apart from an ordinary reader, what's
the minimum viable auth flow.

## Who can log in

**Reuse Supabase Auth exactly as readers already use it**
(`db/schema-identity.sql`) — no second auth system. An admin is a row
in the `editors` table (`docs/editorial-state-implementation-spec-v1.md`
§1) referencing the same `auth.users` a reader would have.

```sql
CREATE TABLE editors (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('editor', 'admin')),
  added_by    UUID REFERENCES auth.users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Distinguishing admin from reader**: presence in `editors`, nothing
else. No separate login screen, no separate password — the same sign-in
a reader would use; the app checks `editors` after sign-in to decide
which experience to show.

## Roles

Two roles, deliberately minimal — per the admin persona (non-technical,
one real person today):

| Role | Can do |
|---|---|
| `editor` | Create/undo overrides (hide, reclassify, boost, pin, source rules) |
| `admin` | Everything `editor` can, plus add/remove other editors |

**Not building a granular permission matrix** — with one real admin
(Izzat) today, a fine-grained permission system would be complexity
with no current user to justify it. Two roles cover "can make editorial
decisions" vs. "can also manage who else can."

## Bootstrap — the first admin

**Real, unavoidable chicken-and-egg question**: the very first `editors`
row has no existing admin to add it. Resolved as a one-time, manual
step at implementation time — inserting Izzat's own `user_id` directly
(via SQL, run once, by whoever implements this), not through the app.
Every `editors` row after that goes through the app itself
(`admin` role adding another row).

## Minimum viable auth flow

```
1. Sign in (existing Supabase Auth — email/password or magic link,
   whichever readers already use)
2. App checks: is this user_id in `editors`?
   - No  → normal reader experience (unchanged)
   - Yes → admin experience (Review Queue, Digest, etc.)
```

No new sign-in UI, no new password system. The only new check is a
single lookup against `editors` after an existing sign-in completes.

## What this spec does NOT do

- Does not create the `editors` table (spec only, table creation is
  implementation)
- Does not build any login/admin UI
- Does not implement the bootstrap insert (documented as the step, not
  performed)
- Does not design a granular permission system — deliberately out of
  scope until more than one real admin exists
