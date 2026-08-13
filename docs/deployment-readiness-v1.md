# Deployment Readiness v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: a CONTRACT, not a deployment action — nothing is deployed
or changed by this document. Focuses on avoiding "works on my laptop,
fails in production."

## 1. Environment Matrix

| Component | Development | Production | Status |
|---|---|---|---|
| Frontend | local Vite dev server (`ui/`, port 5173) | Vercel (`vercel.json`: `buildCommand: vite build`, `outputDirectory: ui/dist`), project `adjung-quick` | Configured, not yet verified as the LIVE deployed build reflects this session's changes |
| Database | Supabase (same project used for dev AND production — no separate staging DB) | Same Supabase project | **Real gap** — dev and "production" are the same database. Every script in this session (`db/ingest-production.js`, `db/classify-production.js`) ran against what would also be the live reader-facing data |
| RSS ingestion | Manual (`node db/ingest-production.js`, run by hand this session) | No scheduled/automated job exists | **Real gap** — production content only updates when someone manually runs the script |
| Classification job | Manual (`node db/classify-production.js --write`) | Same — no automation | **Real gap**, same shape as ingestion |
| Ranking (editorial_v1 pilot) | Runs in-process, inside the reducer, at read time | Same — no separate deployment, it's part of the frontend bundle | No gap — this one genuinely doesn't need separate infra |

**The dev/production database being the SAME Supabase project is the
single most important finding in this matrix** — every ingestion/
classification run this session was already a production write, not a
safe dev sandbox. This matches Izzat's own standing instruction (no
reliable backups, test destructively with extreme care) and explains why
that instruction exists.

## 2. Production Configuration

| Variable | Purpose | Exposure |
|---|---|---|
| `SUPABASE_URL` | Project endpoint | Safe to expose (used client-side as `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | Client-side read access (RLS-scoped) | Safe to expose (used client-side as `VITE_SUPABASE_ANON_KEY`) — this is what the anon/RLS policies added during this session (`GRANT SELECT ... TO anon`) are specifically designed to make safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access, used by `db/*.js` ingestion/classification scripts | **MUST NEVER be exposed client-side** — confirmed: `ui/src/adapter/productionAdapter.js` only ever uses the anon key, never the service role key. `db/*.js` scripts are run manually/locally, never bundled into the frontend build |

**No backend/API server exists** — this is a static frontend (Vercel)
talking directly to Supabase via the anon key, plus a set of local
Node scripts (`db/*.js`) run manually against the service role key.
Confirmed no accidental service-role exposure in any frontend code
path.

## 3. Database Migration Procedure

Real incidents already happened this session that inform this
procedure — not hypothetical:

- UUID vs TEXT mismatch (`db/schema-edition-classification.sql`,
  caught live by a Supabase error Izzat pasted)
- Missing GRANT (new table didn't inherit anon read access)
- RLS enabled with no policy (silently returned 0 rows, no error at
  all — the most dangerous of the three, since nothing failed loudly)

**Before migration:**
- [ ] Backup (blocked — per `docs/production-operations-readiness-v1.md`
      §3, no verified-restorable backup process exists)
- [ ] Snapshot current row counts for tables the migration touches
- [ ] Verify schema assumptions (column types, existing constraints)
      against the ACTUAL current schema, not what's assumed from memory

**Migration:**
- [ ] Execute
- [ ] Verify immediately — query the new/changed column directly,
      don't assume success from "no error returned" (the RLS incident
      above is exactly this failure mode)

**After:**
- [ ] Smoke test (see §6)

## 4. Data Refresh Procedure

`db/ingest-production.js` truncates `rss_items`/`story_clusters`/
`sources` unconditionally before every run (recorded as technical debt
in `docs/production-evidence-lineage.md`, not fixed). This session also
added a truncate to `db/classify-production.js --write` for
`edition_story_classifications` (`docs/editorial-value-dimension-discovery.md`'s
sibling commit).

**Open question, not yet answered**: if a production ingestion run fails
partway through —

```
Step 1: truncate
Step 2: fetch sources     <- fails here, e.g. network timeout
Step 3: classify
Step 4: publish
```

— does a reader see an EMPTY app (since Step 1 already truncated, and
Step 2 never got far enough to repopulate)? Based on reading
`db/ingest-production.js`'s code: **yes** — truncate happens before any
new data is inserted, so a failure after Step 1 leaves the database
empty until a successful re-run. **This is a real, currently-live risk**,
not resolved by anything built this session.

## 5. Release Rollback

| Change | Rollback | Status |
|---|---|---|
| Frontend | Deploy previous Vercel build | Assumed available (Vercel's standard behavior) — not explicitly tested this session |
| Ranking flag | Toggle `state/rankingFlags.js` back to `legacy` | ✅ Solid — verified design, no data migration (`docs/editorial-ranking-activation-policy-v1.md` §5) |
| Schema migration | **?** | **Gap — no reverse migration exists for any schema change made this session.** Written honestly, not assumed solved. |
| Source registry | Git revert `lab/sources.js`, then re-run ingestion | Solid, but requires a successful re-ingestion to take effect — see §4's risk |
| Classification data (`edition_story_classifications`) | **?** | **Gap — table is truncated and rewritten every classify run, no snapshot/restore mechanism exists** (same gap already flagged in `docs/production-operations-readiness-v1.md` §2) |

## 6. Production Smoke Test (checklist, run after any deploy)

- [ ] Homepage loads
- [ ] Edition switch works (`ms-MY` → `en-global` → `ar-global` → back)
- [ ] Wheel loads with the correct taxonomy per edition
- [ ] Active Set shows up to 10 slots
- [ ] Opening a story shows the matching Brief
- [ ] RTL renders correctly in `ar-global`
- [ ] An empty field (e.g. Bencana right now) shows the editorial-standard
      message, not an error
- [ ] Refreshing the browser doesn't break anything

## Launch Blockers vs. Non-blockers

Per ChatGPT — not every open item carries equal weight:

**Blockers** (must not happen at launch):
- Database cannot be restored if something goes wrong
- A reader sees content in the wrong language, or editions bleed into
  each other
- Active Set breaks (empty when candidates exist, duplicates appear)
- A deployment cannot be rolled back

**Non-blockers** (acceptable to launch with, already tracked):
- Bencana/Kesihatan/Alam Sekitar having low/zero coverage
- Editorial Value Dimension not yet built
- Source precision not 100% audited (21/43 sources unaudited,
  `docs/source-intelligence-readiness-audit-v1.md`)

## Next

Per ChatGPT: `docs/real-user-acceptance-test-v1.md` next — a naive
first-time-reader walkthrough, distinct from every targeted/developer
verification done so far. No deployment action taken by this document;
no classifier/ranking changes.
