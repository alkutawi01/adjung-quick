# Production Write Guard v1 (2026-08-13)

Status: `[x] Implementation pending` → `[x] Closed` (guard implemented and verified; Option A staging project itself is separate, still pending)

Per ChatGPT's ADR decision (`docs/production-environment-separation-plan-v1.md`):
**Option A (dedicated staging Supabase) chosen, but the production write
guard comes first** — this document and its implementation.

## What was built

`db/production-write-guard.mjs` — `assertWriteAllowed(env)`, called at
the top of every destructive script BEFORE any network/DB call:

```
DATABASE_ENV=production, no CONFIRM_PRODUCTION_WRITE  -> BLOCKED
DATABASE_ENV=production, CONFIRM_PRODUCTION_WRITE=true -> ALLOWED
DATABASE_ENV=staging                                    -> ALLOWED
DATABASE_ENV=development                                -> ALLOWED
DATABASE_ENV unset or any other value                   -> BLOCKED (fails closed)
```

**Fails closed by design**: an unset `DATABASE_ENV` is treated as unsafe,
not as "assume it's fine." This matches today's real situation — one
shared Supabase project, no staging exists yet
(`docs/production-environment-separation-plan-v1.md` §1) — so a script
run with no environment declared is exactly the accidental-write risk
this guard exists to close.

## Wired into

- `db/ingest-production.js` — guard called as the very first line of
  `main()`, before the RSS fetch even starts.
- `db/classify-production.js` — guard called only when `--write` is
  passed; `--dry-run` (default) never writes, so it's unaffected and
  needs no confirmation.

## Verified (all 3 required scenarios + fail-closed default)

- [x] `db/production-write-guard.test.mjs` — 8/8 unit tests covering
      staging-allowed, development-allowed, production-blocked-without-confirmation,
      production-blocked-with-wrong-confirmation-value,
      production-allowed-with-confirmation, unset-fails-closed,
      unrecognized-value-fails-closed, confirmation-alone-without-production-flag-doesn't-bypass.
- [x] **Live verification against the real scripts** (not just the unit
      test in isolation):
  - `node db/ingest-production.js` with no `DATABASE_ENV` set →
    immediately failed with the guard's error message, before any RSS
    fetch or Supabase call.
  - `DATABASE_ENV=production node db/classify-production.js --write`
    with no `CONFIRM_PRODUCTION_WRITE` → immediately failed with the
    guard's error message, before any classification or write.
  - `node db/classify-production.js` (dry-run, no flags at all) → ran
    normally, unaffected — confirms the guard doesn't interfere with
    the non-destructive path.

## `.env.example` updated

Documents `DATABASE_ENV` (and the commented-out
`CONFIRM_PRODUCTION_WRITE`) as required variables, with a pointer to
this document.

**The real `.env` was deliberately NOT changed** — it currently points
at the one shared Supabase project, which per
`docs/production-environment-separation-plan-v1.md` §1 is effectively
production. Setting `DATABASE_ENV=development` there would be a lie
about what database is actually being written to. Going forward, every
destructive script run against the current shared database now requires
an explicit:

```
DATABASE_ENV=production CONFIRM_PRODUCTION_WRITE=true node db/ingest-production.js
```

This is intentional friction — the guard is meant to make an accidental
write require a deliberate, visible decision every time, until Option
A's real staging project exists and `DATABASE_ENV=staging` becomes the
normal, low-friction path for iteration.

## What this does NOT do

- Does not create the staging Supabase project (Option A itself — still
  pending, per `docs/production-environment-separation-plan-v1.md` §3).
- Does not rename scripts (`ingest-production.js` → `ingest.js` etc.,
  ChatGPT's suggested step 3) — not done yet, kept as a future step.
- Does not implement the staging → validation → manual approval →
  production promotion model (`docs/production-environment-separation-plan-v1.md`
  §4) — that requires the staging project to exist first.
- Does not touch any classifier, ranking, or pilot logic.

## Next

Per ChatGPT: this guard is "the last step before we're ready to touch
production deployment seriously." Next real step is building the actual
staging Supabase project (Option A), then re-running the migration
strategy discussion (`docs/production-environment-separation-plan-v1.md`
§3) against a real staging environment instead of a plan.
