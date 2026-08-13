# Production Operations Readiness v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: focuses on the `docs/launch-readiness-gate-v1.md` NOT READY
items specifically — monitoring, rollback, backup verification, error
ownership. This document records what's genuinely missing; it does not
build any of it (no monitoring code, no rollback tooling implemented
here — this is a gap map, matching the same discipline as
`docs/source-intelligence-readiness-audit-v1.md`).

## 1. Monitoring — what doesn't exist yet

Currently, every verification this session has done (classification
coverage, ranking output, shadow comparisons) was a MANUAL script run,
read by a human. Nothing surfaces a problem without someone deliberately
looking.

**Coverage alerts** (would need building):
```
Agama: 20 stories -> 0 stories        (a real, current example —
                                        this exact drop happened silently
                                        between sessions, only caught
                                        because Izzat noticed manually)
Politik: 500 stories -> 20 stories    (illustrative — a sudden collapse
                                        in candidate pool size)
```

**Ranking health metrics** (would need building):
- `active_set_generation_success` — did the pipeline complete without
  error for this (edition, field)?
- `duplicate_count` — did a duplicate slip through Composition's
  near-duplicate check?
- `empty_slot_count` — how many of the 10 slots came back empty?
- `latency` — how long did Candidate Scoring → Diversity Selection →
  Composition take?

None of these are instrumented today. Every number quoted in this
session's ranking documents came from a one-time script run, not a
metric that would alert on its own.

## 2. Rollback plan — beyond ranking

`docs/editorial-ranking-activation-policy-v1.md` §5 already covers
ranking-specific rollback (flip a config flag, no data migration). This
section is about everything ELSE that can go wrong:

| Change type | Rollback today | Gap |
|---|---|---|
| Ranking flag (`editorial_v1` → `legacy`) | ✅ Config change, no migration | None — already solid |
| Database migration (e.g. `db/schema-source-known-category.sql`) | ❌ No documented reverse migration for any schema change made this session | Real gap |
| Source registry update (`lab/sources.js`) | ✅ Git revert (source config is code, not data) | Minor — depends on re-running ingestion after revert |
| UI deployment | ❌ No documented rollback procedure (which platform, how fast, who triggers it) | Real gap |
| A bad classification re-ingest (e.g. `db/classify-production.js --write` truncates and rewrites `edition_story_classifications` every run — `docs/production-evidence-persistence-gap.md`'s already-recorded technical debt) | ❌ No snapshot/restore mechanism for this table specifically | Real gap, already flagged as technical debt once before |

## 3. Backup verification — the real question

Per ChatGPT: "database ada backup" is not the same claim as "can
actually be restored." This session has operated under Izzat's own
standing instruction that **no reliable DB backups exist** — that was
true before this session and this document does not change it. No
backup restore has been tested or verified as part of any work here.

**Status: unresolved, pre-existing, out of scope for this session's
work to fix — recorded here so it's visible at the launch gate rather
than assumed away.**

## 4. Error ownership — who acts on what

| Failure type | Owner / next action |
|---|---|
| RSS fetch failure | Source audit (`docs/source-intelligence-readiness-audit-v1.md` is the starting map) |
| Classification anomaly (coverage drop, wrong field) | Calibration review (per the discipline already established — never a reflexive keyword patch) |
| Ranking pipeline error | Check `docs/editorial-ranking-activation-policy-v1.md` §1 rollback criteria — flip the flag if it's a real runtime error |
| UI/frontend failure | Frontend rollback (deployment platform — not yet documented which one or how, see §2) |

This table exists so a future incident has a first move, even though the
underlying tooling (alerts, dashboards) doesn't exist yet — a human
still has to notice the problem first, today.

## What's next, per ChatGPT (not started here)

**A. Deployment readiness** — environment config, hosting, secrets
management, the actual database migration PROCEDURE (not just
individual migration files), production build process.

**B. Real user acceptance test** — not a developer test. A full session
as a first-time reader: open the app, pick an edition, enter a Bidang,
read a story, switch language/edition, encounter an empty Bidang, reopen
a story, refresh the page. Distinct from every verification so far,
which has been scripted/targeted, not a naive first-time-user walk.

## What does NOT need to be perfect before launch (per ChatGPT, explicit)

- Bencana/Kesihatan/Alam Sekitar being genuinely thin/empty — the system
  already has an honest empty state, a stable taxonomy, and an audit
  trail. Not launch-blocking.

**What genuinely cannot fail before launch**: a reader seeing content in
the wrong language, editions bleeding into each other, a broken Active
Set, or a system that can't be recovered if something does go wrong.
Those are the real bar — not "every Bidang full," not "every source
audited."

## Next

Per ChatGPT: continue toward A (Deployment Readiness) and B (Real User
Acceptance Test) as the two remaining major work items before launch
consideration. No classifier/ranking changes.
