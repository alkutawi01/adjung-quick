# Staging Environment Setup Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` → **DECIDED 2026-08-13** `[x] Implementation pending` `[ ] Closed`

## Izzat's decision (2026-08-13)

> "Buat staging ringan dahulu menggunakan dataset salinan. Jangan tambah
> kos Supabase lagi. Bila pengguna sebenar dan trafik meningkat, baru
> pertimbangkan staging project berasingan."

A dedicated Supabase staging project (§3 Option A) is **deferred**, not
chosen — no added Supabase cost until real traffic justifies it.
Instead: **local, file-based snapshot ("staging ringan")**.

**What was actually feasible, checked before building**: no Docker on
this machine, so a local Supabase instance (the free, zero-cost way to
run a real local Postgres+Supabase stack) wasn't an option either. The
lightest genuinely-available substitute: `db/snapshot-production.mjs`
(read-only export of real production data to a local, gitignored JSON
file) + `db/local-snapshot-loader.mjs` (lets scripts test against that
copy entirely offline, no Supabase call at all). Verified working:
snapshotted 43 sources / 865 story_clusters / 917 rss_items / 867
placements, then loaded 36 real Politik candidates from the local file
with zero network calls.

This satisfies "dataset salinan" and "$0 added cost" exactly, though
it's a weaker isolation than a real staging database (no RLS, no schema
enforcement, no live-write testing) — recorded honestly in §"What this
does NOT provide" below, not oversold as equivalent to Option A.

### What this DOES provide

- A real, versioned copy of production data (snapshot date + ruleset
  version recorded in the file itself) that scripts can test against
  without ever touching the shared live database
- Zero cost, zero new infrastructure, works today
- Satisfies most of what this session's own verification work actually
  needed — every ranking benchmark/audit this session read data, never
  needed to WRITE against a live DB to be useful

### What this does NOT provide (honest gap, not solved)

- No schema/migration rehearsal — a snapshot has no schema of its own,
  it can't catch the UUID/TEXT or RLS-policy incidents this session hit
  live
- No RLS/auth testing — `db/identity-test.js` still needs a real
  database with real Auth
- No write-path testing — ingestion/classification `--write` behavior
  still can only be verified against production (behind the write guard)
- Still a **snapshot**, not live — goes stale the moment production RSS
  updates again; re-run `db/snapshot-production.mjs` to refresh

### Original open questions below (§1-7) — now answered by this decision where applicable

Per ChatGPT: plan only — **no new Supabase project created, no
migration, no classifier/ranking/UI changes.** Completes the
environment-separation decision chain:
`docs/production-environment-separation-plan-v1.md` (ADR: Option A +
guard-first) → `docs/production-write-guard-v1.md` (guard, done) →
this document (staging setup plan) → actual staging project creation
(next, not here).

## 1. Environment file separation

Currently: one `.env` for everything. Target:

```
.env.development   — DATABASE_ENV=development, SUPABASE_URL=<staging project>
.env.production     — DATABASE_ENV=production,  SUPABASE_URL=<current/only project>
```

**Never one `.env` covering both again** — this is the direct
consequence of the write guard's own principle (per ChatGPT's praise of
not touching the real `.env`): a config file should honestly declare
which real database it points at, not be silently reused across
environments.

## 2. Credentials separation

Each environment file carries its OWN Supabase URL + keys — a
development/staging script must physically be unable to reach the
production database by using the wrong file, not just be told not to
via `DATABASE_ENV`. The write guard (`docs/production-write-guard-v1.md`)
is the second layer of defense; separate credentials are the first.

## 3. Access model

| Role | Staging | Production |
|---|---|---|
| Developer | read/write | write requires explicit approval (the guard's `CONFIRM_PRODUCTION_WRITE`) |
| Production runtime (reader-facing app) | — | read only (already true today — `productionAdapter.js` only ever uses the anon key) |
| Controlled jobs (future scheduled ingestion) | — | write, but only the specific automated job, not ad hoc scripts |

## 4. Data refresh policy — staging, MVP scope

**Not auto-sync.** Per ChatGPT: manual snapshot only, for now, with an
explicit record per snapshot:

```
snapshot date:
source: (which production tables/rows this staging data came from)
schema version:
classification version: (classification_ruleset_version)
ranking version: (which ranking flags were active at snapshot time)
```

This matters specifically because staging needs to be able to answer
"is this staging behavior representative of production, or stale?" —
an un-versioned snapshot can't answer that.

## 5. Promotion model

Locked as the target (not yet built):

```
Staging validation
      ↓
Human approval
      ↓
Production change
```

**Staging must never BE production** — no shortcut where a "successful
staging run" auto-applies to production without an explicit human step
in between. This directly extends the same principle already applied to
classification calibration (`docs/calibration-ready-engine.md`: corrections
never auto-apply as rules) and ranking (`docs/editorial-ranking-activation-policy-v1.md`:
divergence from legacy is expected, reviewed, not silently trusted).

## 6. Launch Gate update (addition to `docs/launch-readiness-gate-v1.md`)

**Production separation:**

| Item | Status |
|---|---|
| Production write guard | ✅ READY (`docs/production-write-guard-v1.md`) |
| Staging environment | ⚠️ PARTIAL — local snapshot only (`db/snapshot-production.mjs`), no live staging DB. Deferred by Izzat's decision, not a gap to close now. |
| Production/staging separation | ⚠️ PARTIAL — write guard + local snapshot cover read-testing isolation; write-path testing still can't be isolated from production |
| Restore rehearsal | ❌ NOT READY — no backup has ever been verified restorable (`docs/production-operations-readiness-v1.md` §3); unaffected by the snapshot decision, still a real gap |

## 7. Next real steps (not done in this document)

1. Create the actual Supabase staging project.
2. Set up `.env.development`/`.env.production` credentials per §1-2.
3. Restore/seed staging with a snapshotted copy of production data
   (§4's format).
4. Run the full pipeline (ingest → classify → rank) against staging
   end-to-end, verifying it behaves the same way production did in this
   session's own verification work — a real test that staging is
   representative, not just present.

## What is still NOT decided (deferred, per Izzat)

- Exact Supabase plan/tier for a dedicated staging project — deferred
  until real traffic/users justify the cost, per Izzat's explicit
  decision above
- Timing for when that becomes worth revisiting
- Whether staging needs its own separate Vercel deployment/preview URL —
  moot for now, since there's no live staging service, only a local
  snapshot file

## Next

Local snapshot approach (`db/snapshot-production.mjs` +
`db/local-snapshot-loader.mjs`) is implemented and verified working —
this is now the standing "staging ringan" until real traffic changes the
calculus. Re-run the snapshot script periodically to keep it from going
stale. Revisit Option A (dedicated Supabase staging project) only when
real user traffic makes the added cost worthwhile, per Izzat's own
stated trigger.
