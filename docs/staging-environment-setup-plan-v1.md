# Staging Environment Setup Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

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
| Staging environment | ❌ NOT READY — doesn't exist yet |
| Production/staging separation | ❌ NOT READY — depends on staging existing |
| Restore rehearsal | ❌ NOT READY — no backup has ever been verified restorable (`docs/production-operations-readiness-v1.md` §3) |

## 7. Next real steps (not done in this document)

1. Create the actual Supabase staging project.
2. Set up `.env.development`/`.env.production` credentials per §1-2.
3. Restore/seed staging with a snapshotted copy of production data
   (§4's format).
4. Run the full pipeline (ingest → classify → rank) against staging
   end-to-end, verifying it behaves the same way production did in this
   session's own verification work — a real test that staging is
   representative, not just present.

## What this document does NOT decide

- Exact Supabase plan/tier for the staging project (cost implication —
  Izzat's decision, not made here)
- Timing — when to actually create the staging project
- Whether staging needs its own separate Vercel deployment/preview URL,
  or can be exercised purely via local scripts pointed at
  `.env.development`

## Next

Per ChatGPT: this plan is complete as a document. Actual staging project
creation is real infrastructure work — the next step, but genuinely
outside what a documentation/planning pass should decide alone.
