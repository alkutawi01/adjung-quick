# Post-Launch Monitoring Plan v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[x] Implementation pending` `[ ] Closed`

Priority 1 per ChatGPT's post-launch direction: **"sekarang sistem
sudah hidup. Kita perlukan tahu kalau rosak."** Adjung Quick v1.0 is
live (`docs/launch-execution-checklist-v1.md`) with zero automated
monitoring — every number in every audit this whole project has come
from manually running a script and reading terminal output, never from
a system that surfaces a failure unprompted
(`docs/launch-readiness-gate-v1.md`'s NOT READY list).

This document defines what "minimum real monitoring" means for a
single-editor, zero-budget, RSS-based reader — not an enterprise
observability stack. Per Izzat's own established cost discipline this
session (no added Supabase/infra cost without real traffic justifying
it), this plan is scoped to **free, script-based checks Izzat or Claude
can run**, not a paid monitoring service.

## 1. What "broken" actually means here

Four independent failure classes, since a single "is it up" check
would miss most of them (the site can be perfectly reachable while the
data behind it silently rots):

1. **Pipeline failure** — RSS sources stop fetching, or fetch but
   nothing gets classified
2. **Editorial failure** — a field goes unexpectedly empty, or one
   source starts dominating unnaturally
3. **Edition failure** — language/locale leakage (Malay text in
   en-global, missing RTL, etc.) — the exact class of bug found and
   fixed multiple times this session
4. **Frontend failure** — the deployed site itself errors or fails to
   load

## 2. Daily check — Pipeline health

Run: `node db/snapshot-production.mjs` (already exists, read-only,
zero cost) then inspect its own summary output:

```
sources: N        ← should stay near 43 (drop = a source dying)
story_clusters: N  ← should grow day over day (RSS still flowing)
rss_items: N
edition_story_classifications: N
```

**Alert condition (manual, for now):** `story_clusters` count flat or
shrinking across 2+ consecutive days → a real ingestion stall, worth
investigating immediately (RSS source outage, Supabase quota, etc.).

## 3. Daily check — Editorial distribution

Run `db/classify-production.js` (dry run, no `--write` needed) and read
its per-edition field breakdown (already printed by the script — see
`docs/post-launch-classification-calibration-v1.md`'s before/after
tables for the exact shape).

**Alert conditions:**
- Any previously-populated field (Politik, Bisnes, Sukan, etc.) drops
  to 0 — a real regression, not a slow news day
  (single-field-zero-for-one-day is normal for niche fields, is NOT
  normal for high-volume fields)
- `(unclassified)` count jumps sharply vs. the last known baseline
  (`ms-MY`: 16/725, `en-global`: 38/91, `ar-global`: 29/51 as of
  2026-08-13 — see this run's own numbers as the reference point)
- One source suddenly accounts for a much larger share of one field
  than usual — possible new registry mismatch (same shape as the RTM
  Category Feed Mismatch pattern, `docs/known-issues.md` §3)

## 4. Weekly check — Edition correctness

Manual smoke test, same shape as the launch checklist's Step 5, run
weekly (or after any classifier/ranking change):

- [ ] `en-global`: no Malay-language card titles
- [ ] `ar-global`: `<main dir="rtl">` still present, Arabic titles render
- [ ] `ms-MY.Politik`: still `editorial_v1` (ranking flag unchanged
      unless deliberately touched, `state/rankingFlags.js`)
- [ ] Swipe/release one card in any field — replacement still works

## 5. On-demand check — Frontend health

- `https://adjung-quick.vercel.app` loads, no console errors
  (`read_console_messages` / browser devtools)
- Bundle hash sanity check: does the live site's `assets/index-*.js`
  hash match the most recent `git log` commit's expected build? (Catches
  a silently-failed or stuck Vercel deploy — the exact check used to
  confirm the v1.0 launch deploy actually took effect.)

## 6. What this plan deliberately does NOT include

- No paid error-tracking service (Sentry, etc.) — zero budget, zero
  traffic yet to justify it
- No automated alerting/paging — nothing here fires on its own; a human
  (Izzat or Claude, when asked to check) runs these scripts
- No uptime monitoring service — the free tier of most of these only
  matters once real traffic exists
- No database performance monitoring — out of scope until real load
  exists

**This is intentionally the minimum real thing, not a placeholder for
a "real" system later.** Automating any of the above (a scheduled
script + a Slack/email alert) is a natural next step once Izzat wants
to stop running these manually — not built now, per the same
zero-added-cost discipline as the local snapshot staging decision
(`docs/staging-environment-setup-plan-v1.md`).

## 7. Immediate baseline (recorded 2026-08-13, right after launch + calibration)

```
sources: 43
story_clusters: 865
rss_items: 917
edition_story_classifications: 867

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

Use this as the reference point for "did something break" comparisons
until the next recorded baseline.
