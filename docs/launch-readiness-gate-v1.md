# Launch Readiness Gate v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: Adjung Quick has accumulated substantial technical
documentation (ranking contract, benchmarks, shadow evaluation,
activation policy, known issues, source intelligence audit) but no
single "gate" that says, plainly, what's actually ready for real
production traffic versus what still needs work. This document is that
gate — a status snapshot, re-evaluated as work continues, not a
one-time checklist to complete and forget.

## READY

- **Edition architecture** — `ms-MY`/`en-global`/`ar-global` independent
  taxonomies, locale authority, representation eligibility. Verified
  live, regression-tested (`docs/ui-2-closure-report.md`).
- **Active Set** — Bidang-scoped, Stable Spatial Slots, swipe/release
  fixed and verified (`docs/ui-2-closure-report.md` Bug 3).
- **Ranking pilot** — `ms-MY.Politik` on `editorial_v1`, verified live,
  rollback path exists, no data migration risk
  (`docs/editorial-ranking-activation-policy-v1.md`).
- **RTL** — Arabic edition verified live, layout intact.
- **i18n (UI chrome)** — static strings (empty states, buttons, errors)
  follow the active edition's locale, verified live.

## CONDITIONAL

- **Niche field coverage** — Bencana/Kesihatan/Alam Sekitar have ZERO
  classified stories (real content exists, classifier vocabulary gap —
  `docs/niche-field-coverage-audit.md`). Sains/Pendidikan are
  single-source fields. Launch is possible with these Bidang visibly
  thin/empty (the empty-state design already handles this gracefully,
  `docs/empty-bidang-policy.md`) — but this is a real content gap a
  launched reader WILL notice, same as Izzat just did.
- **Source precision** — 2 confirmed RTM feed mismatches, 4 more feeds
  in the same family unaudited, 21/43 sources never directly sampled
  (`docs/source-intelligence-readiness-audit-v1.md`).
- **Editorial Value Dimension** — known gap (evergreen/knowledge content
  under-recognized), affects niche fields specifically, deliberately not
  yet designed (`docs/editorial-value-dimension-discovery.md`).

## NOT READY

- **Monitoring** — no error tracking, no alerting, no dashboard for
  ingestion/classification/ranking failures. Everything verified so far
  has been verified by manually running scripts and reading console
  output, not by a system that would surface a failure unprompted.
- **Deployment rollback** — the Ranking Engine flag has a rollback path
  (config change, `docs/editorial-ranking-activation-policy-v1.md` §5),
  but no equivalent verified process exists for a bad classification
  re-ingest, a broken UI deploy, or a schema migration gone wrong.
- **Production backup verification** — per Izzat's own standing
  instruction this session (no reliable DB backups exist, test
  destructively with extreme care) — this was true before this session
  and remains true; not addressed by anything built here.
- **Error tracking** — RSS fetch failures, classification failures, and
  ranking pipeline errors are currently only visible by manually running
  scripts (`db/ingest-production.js`, `db/classify-production.js`,
  `ranking/benchmark-runner.mjs`) and reading terminal output. Nothing
  surfaces a failure to a human without someone looking for it.
- **Full staging environment** — no dedicated staging database exists.
  Deferred deliberately by Izzat's decision (`docs/staging-environment-setup-plan-v1.md`):
  no added Supabase cost until real traffic justifies it. See CONDITIONAL
  below for what partial coverage now exists instead.
- **Restore rehearsal** — no backup has ever been verified restorable.
  Unaffected by the local snapshot work below — still a real gap.

## Update — Local Snapshot Rehearsal (2026-08-13)

Per Izzat's decision, moved from NOT READY to **CONDITIONAL**:

- **Local snapshot rehearsal**: `db/snapshot-production.mjs` +
  `db/local-snapshot-loader.mjs` — a real, versioned, offline copy of
  production data, verified working, backed by
  `db/snapshot-regression.test.mjs` (5/5 architecture invariants
  confirmed against real data: Ranking Engine pilot field has real
  candidates, Edition Locale Authority holds, Arabic placements are
  backed by real Arabic representation, no null-field classified rows,
  the KPM tender filter still holds).
- **What it's for**: ranking benchmarks, shadow evaluation, regression
  tests, UI preview, editorial review.
- **What it's explicitly NOT for**: treated as live truth, used to
  publish anything, or a substitute for production monitoring.
- **Full staging** (a live database with schema/RLS/write-path testing)
  remains NOT READY — the snapshot is a real improvement, not a
  replacement for it.

## Discipline for future documents (per ChatGPT, to avoid a "museum of issues")

Every new audit/finding document from this point forward should carry an
explicit status line, so open items don't accumulate silently:

```
Status: [ ] Observation  [ ] Decision needed  [ ] Implementation pending  [ ] Closed
```

## Next

Per ChatGPT: continue with Source Intelligence Readiness Audit
(done, `docs/source-intelligence-readiness-audit-v1.md`) and this gate
document (done). No new features. No classifier/ranking changes — every
classification-layer issue found stays at Observation status until a
proper calibration cycle. Re-evaluate this gate as monitoring, backup
verification, and error tracking work (the actual NOT READY items) gets
addressed — not before.
