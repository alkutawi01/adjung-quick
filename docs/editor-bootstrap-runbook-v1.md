# Editor Bootstrap Runbook v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[x] Closed`

## Executed 2026-08-13

Izzat created his account (`alkutawi01@gmail.com`) via the Supabase
Dashboard's own Users panel — confirmed live via `auth.admin.listUsers()`.
The bootstrap `INSERT` (Step 3) was run against production with his real
`user_id` (`419b2649-8d04-47cb-9540-43b9a67dd7e7`), `role: 'admin'`.
Verified two ways: the Step 4 SQL check, and a live call to
`db/editor-auth.mjs`'s `getEditorRole()` against the real account —
both confirm `role = 'admin'`. Fasa 3.6.1 Foundation is now fully
verified end-to-end, not just schema-deployed.

Category: **Runbook.** How to turn Izzat's own Supabase Auth account
into the first `admin` row in `editors`
(`db/schema-editorial-state.sql`, live in production as of Fasa 3.6.1).

**Why this can't be automated or faked**: the model is
`auth.users → editors.user_id → role`. A hardcoded/fake `editors` row
with no real `auth.users` account would mean the audit trail
(`created_by` on every override) has no real owner, and every RLS
policy checking `auth.uid()` would never actually match a real signed-in
session. Per ChatGPT: this is a real dependency, not a workaround
opportunity.

**Why Claude can't do this step**: creating an account and entering a
password are both actions Claude is not permitted to perform on a
user's behalf (session-wide policy — account creation and credential
entry are always the user's own action). This step must be done by
Izzat, not relayed through Claude.

---

## Step 1 — Izzat creates a real account

Izzat signs up through Adjung Quick's own existing sign-in flow (the
same Supabase Auth reader accounts already use, per
`db/schema-identity.sql`) — no separate admin login screen exists or is
needed. Email + password, exactly like any reader would sign up.

**Not yet live in the UI as of this runbook** — Adjung Quick's own
sign-up screen for readers hasn't been verified as built (Identity
Layer scope, separate from this Fasa). If reader sign-up isn't yet
reachable in the app, the alternative is signing up directly via
Supabase's own Auth panel (Dashboard → Authentication → Users → Add
user), which produces the identical `auth.users` row the app's own
sign-up flow would.

## Step 2 — Find the new account's `user_id`

Once the account exists, its `id` (a UUID) is visible in Supabase
Dashboard → Authentication → Users, or queryable directly:

```sql
SELECT id, email FROM auth.users WHERE email = '<Izzat's email>';
```

## Step 3 — Insert the first `editors` row

This is the one-time, outside-the-app step
(`docs/admin-auth-spec-v1.md`'s documented bootstrap) — run once, by
whoever has database access, using the `user_id` from Step 2:

```sql
INSERT INTO editors (user_id, role, added_by)
VALUES ('<user_id from Step 2>', 'admin', NULL);
```

`added_by` is `NULL` only for this very first row — every `editors` row
after this one is added through the app itself (an existing admin
adding another), which will populate `added_by` with a real value.

## Step 4 — Verify

```sql
SELECT e.user_id, e.role, u.email
FROM editors e
JOIN auth.users u ON u.id = e.user_id;
```

Should return exactly one row: Izzat's email, `role = 'admin'`.

## Rollback — if the wrong account was bootstrapped

```sql
DELETE FROM editors WHERE user_id = '<wrong user_id>';
```

Safe and complete — `editors` has no dependents yet (no overrides can
exist referencing a `created_by` that was never real), so this fully
undoes the mistake. Re-run Steps 2–4 with the correct account.

## What happens after bootstrap

Per ChatGPT: bootstrap verification (confirming the `admin` role
actually resolves correctly through `db/editor-auth.mjs`'s
`getEditorRole()`, live against the real account) happens next — still
before any Review Queue UI work begins.
