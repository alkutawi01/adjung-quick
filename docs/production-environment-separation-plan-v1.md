# Production Environment Separation Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: a DECISION document, not a migration. Nothing is migrated
or touched here. This addresses the single biggest operational risk
found across this session's readiness work
(`docs/deployment-readiness-v1.md` §1): development/test operations and
real reader traffic currently share the exact same Supabase project.

## 1. Current state (as it actually is)

```
Frontend: Vercel (project "adjung-quick", vercel.json)
Database: ONE Supabase project — shared by everything
Ingestion: manual local execution (node db/ingest-production.js)
Classification: manual local execution (node db/classify-production.js --write)
Reader: same database as all of the above
```

**Real risks, not hypothetical — confirmed by this session's own
history**:
- `truncate` can empty what a real reader sees (`db/ingest-production.js`
  truncates `rss_items`/`story_clusters`/`sources` unconditionally every
  run; this session added the same pattern to
  `db/classify-production.js --write` for
  `edition_story_classifications`)
- A schema migration can disrupt production directly — 3 real incidents
  already happened this session (UUID/TEXT mismatch, missing GRANT,
  RLS-with-no-policy), each one live against the real database
- No experiment or test this session was ever actually isolated — every
  verification, benchmark, and audit ran against the same data a real
  reader would see

## 2. Target state (minimum viable, per ChatGPT — Adjung Quick is still MVP)

```
Development
      ↓
Staging/Test DB
      ↓
Production DB
      ↓
Reader
```

| Environment | Purpose | Data |
|---|---|---|
| Development | Coding, experiments, destructive tests | Synthetic/sample |
| Staging | Full ingestion test, classification validation, migration rehearsal | Copy/snapshot of production |
| Production | Reader-facing only, controlled jobs | Real |

## 3. Migration strategy — options, not a decision made here

**Option A — separate Supabase project for staging**
- Pro: clearest isolation
- Con: extra cost, extra config to maintain

**Option B — schema separation within one project**
- Pro: single project to manage
- Con: weaker isolation (a bad migration or truncate could still be run
  against the wrong schema by mistake — the exact failure mode this plan
  exists to prevent)

**Option C — clone production**
- Pro: closest fidelity to real behavior
- Con: needs an ongoing sync process, adds its own maintenance burden

**No option chosen here** — this is a decision for Izzat/ChatGPT, not
something to pick unilaterally.

## 4. Data flow — the part that matters most

**Current:**
```
RSS -> ingest-production.js -> Supabase -> Reader
```

**Target:**
```
RSS -> Staging ingestion -> Validation -> Promotion -> Production
```

The key addition: a **validation/promotion step** between where new
data lands and where a real reader sees it — currently these are the
same moment (a successful `ingest-production.js --write` run is
immediately reader-visible, with no review step in between).

## 5. Write permissions

Locked as a target, not yet implemented:

```
Reader:              read only
Automation/admin:    write (staging + production, controlled)
Development:         cannot touch production at all
```

## 6. Launch Decision Gate (addition to `docs/launch-readiness-gate-v1.md`)

Launch should happen only after:

- [ ] Production DB isolated from development/test operations
- [ ] Migration tested against staging first, not production directly
- [ ] Backup verified restorable (per
      `docs/production-operations-readiness-v1.md` §3 — still
      unresolved)
- [ ] Rollback tested (per `docs/deployment-readiness-v1.md` §5's
      currently-open gaps)

## 7. Minimum viable safety guard (recommended immediate next step, per ChatGPT)

Per ChatGPT: don't over-build staging infrastructure yet — Adjung Quick
is still MVP. The one thing worth doing regardless of which option (§3)
gets chosen: a **hard guard on every destructive script**, since this
session's own history shows truncate/migration against real data has
already happened multiple times, not through anyone's mistake but as a
normal risk of an actively-developing system with no separation.

```
Before any destructive script runs:
  requires DATABASE_ENV=production
  AND    CONFIRM_PRODUCTION_WRITE=true
  Missing either -> script fails immediately, no write attempted
```

Applies to: `db/ingest-production.js`, `db/classify-production.js
--write`, and any future script with a `--write`/destructive mode.

**Not implemented in this document** — recorded as the concrete,
minimum-scope recommendation for the next step, per §"Next" below.

## Next

Per ChatGPT: this plan needs a DECISION (which option in §3, whether to
build the §7 guard first) before any implementation. No database change,
no migration, no classifier/ranking change made by this document itself.
