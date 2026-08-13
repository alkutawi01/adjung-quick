# Post-Launch Stability Checkpoint v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Per ChatGPT: before opening any new quality-improvement work (RTM source
precision audit, etc.), record a clean checkpoint of what's actually
running right now, post-launch, post-calibration — so any future change
has a clear "what changed since" baseline.

## Launch state

| | |
|---|---|
| Version | Adjung Quick v1.0 |
| Deployment | `e5c20a7` (tag `v1.0.0-rc1`), Vercel project `adjung-quick` |
| URL | `https://adjung-quick.vercel.app` |
| Status | Running |

## Post-launch changes so far

| Change | Type | Status |
|---|---|---|
| Desktop layout centered (640px column, ≥720px viewport) | Enhancement | Applied |
| Disaster/Health/Environment vocabulary calibration | Calibration | Applied |
| Bernama-prefix over-stripping fix | Hotfix | Applied |
| Per-subject confidence gate override (Disaster/Environment/Health, 0.35) | Calibration | Applied |
| Production re-classification (`classify-production.js --write`) | Calibration (data write) | Applied |
| Snapshot extended to `saved_stories`/`history_entries` | Safety improvement | Applied |

Full detail for each: `docs/post-launch-classification-calibration-v1.md`,
`docs/restore-rehearsal-v1.md`.

## New operational findings (this checkpoint)

**Supabase Free Plan: no backup capability at all.**

- Impact: restore requires the external local snapshot
  (`db/snapshot-production.mjs`) plus manual recovery — no managed
  point-in-time or scheduled backup exists at the current plan tier.
- Decision: upgrade to Supabase Pro ($25/mo, unlocks daily backups)
  **deferred** until real reader traffic/operational need justifies the
  cost — same trigger already set for staging
  (`docs/staging-environment-setup-plan-v1.md`).

## Post-launch classification snapshot baseline

Recorded immediately after the Disaster/Health/Environment calibration
write, so any future calibration or audit (RTM source precision, etc.)
has a clean "before" to diff against:

```
post-launch-classification-snapshot-v1 (2026-08-13)

sources: 43
story_clusters: 865
rss_items: 917
edition_story_classifications: 867
saved_stories: 0
history_entries: 0
ruleset version: v1.3.0

ms-MY: 709/725 classified (98%)
  Pendidikan 193, Bisnes 93, Sukan 91, Malaysia 64, Hiburan 61,
  Dunia 45, Politik 36, Teknologi 31, Jenayah 28, Gaya Hidup 25,
  Agama 24, Bencana 8, Sains 5, Alam Sekitar 4, Kesihatan 1,
  (unclassified) 16

en-global: 53/91 classified (58%)
  World 18, Disaster 8, Politics 5, Business 5, Environment 4,
  Crime 3, Health 2, Economy 2, Sports 2, Science 2, Culture 1,
  Technology 1, (unclassified) 38

ar-global: 22/51 classified (43%)
  سياسة 13, رياضة 6, اقتصاد 2, كوارث 1, (unclassified) 29
```

(Same numbers as `docs/post-launch-monitoring-plan-v1.md` §7 — recorded
in both places deliberately: one as the monitoring reference point, one
as this checkpoint's frozen baseline. Both should be re-read together,
not duplicated content maintained separately going forward.)

## Priority queue (per ChatGPT, re-ordered post-launch)

**P0 — Production stability**
- [x] Monitoring plan written
- [x] Classification calibration recorded
- [ ] Observe real data over the next few days (no action yet — just watching)

**P1 — Safety**
- [ ] Decide the concrete Supabase-upgrade trigger (traffic threshold, not just "someday")
- [ ] Restore strategy beyond the local snapshot (§ above — deferred, documented)

**P2 — Quality improvements** (not started yet, deliberately)
- RTM source precision audit
- Source intelligence scoring
- Editorial Value Dimension

## What NOT to do right now (per ChatGPT, explicit)

Do not start the RTM source precision audit yet, even though it's a
known, real, already-documented issue
(`docs/known-issues.md` §3). Reasoning: it doesn't crash the reader,
doesn't leak content across editions, doesn't block launch, and already
has a known-issue record — it's a calibration improvement, not a
production incident. Reopen it only after this checkpoint is reviewed
and P0/P1 above have had time to show real data.
