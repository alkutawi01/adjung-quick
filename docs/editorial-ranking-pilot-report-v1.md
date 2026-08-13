# Editorial Ranking Pilot Report — ms-MY.Politik (2026-08-13)

Status: **Structure created now, per ChatGPT — not a "wait weeks then
report" document.** Tracks the live pilot of `editorial_v1` for
`ms-MY.Politik` (`docs/editorial-ranking-activation-policy-v1.md`). Add
entries as observations accumulate — this is a running record, not a
one-time snapshot.

## Purpose

`docs/editorial-ranking-shadow-evaluation-v1.md` was a one-time,
pre-activation evaluation. This document is the ONGOING record now that
`editorial_v1` is live for real readers of `ms-MY.Politik` — per the
Activation Policy §2 (comparison period), shadow monitoring continues
alongside production, and this is where that continued comparison gets
recorded.

## Technical metrics (to track over time)

| Date | Error rate | Latency | Empty Active Set occurrences | Duplicate rate |
|---|---|---|---|---|
| 2026-08-13 (activation day) | 0 (live verification, `docs/editorial-ranking-activation-policy-v1.md` §6) | not yet measured | 0 | 0 |

## Editorial metrics — legacy shadow vs editorial actual

Per entry: date, field, legacy source distribution (what shadow mode
would have shown), editorial source distribution (what was actually
shown).

| Date | Field | Legacy (shadow) | Editorial (actual) |
|---|---|---|---|
| 2026-08-13 | Politik | Astro Awani 7, Utusan 2, Metro 1 (approx., per earlier shadow run pattern) | Astro Awani 3, Utusan 4, Metro 3 (confirmed live, `docs/editorial-ranking-activation-policy-v1.md` §6) |

## Manual spot check (per ChatGPT: not exhaustive — 5 top-scored + 5 diversity-promoted + 5 demoted)

Reuses the same review shape as
`docs/editorial-ranking-shadow-evaluation-v1.md` §5, but ongoing rather
than one-time. Central question for each spot check round: **"Does this
selection still feel like Adjung?"** — not a technical correctness
question, an editorial-identity one.

| Round | Date | Sample | Izzat's verdict | Notes |
|---|---|---|---|---|
| 1 | 2026-08-13 | 10 stories (5 promoted, 5 demoted) | 8/10 correct/acceptable, 1 regression (Imam al-Bukhari), 1 conditional | Full detail in `docs/editorial-ranking-shadow-evaluation-v1.md` §5. Regression traced to the Editorial Value Dimension gap, not a ranking bug. |

Next spot-check round: not yet scheduled — add a new row whenever a
future review happens, don't wait for a fixed cadence.

## Explicit: what is NOT activated yet, and why (per ChatGPT)

| Field | Status | Reason |
|---|---|---|
| Agama | legacy | Needs the Editorial Value Dimension (evergreen/knowledge content signal) — this is exactly where the one real regression occurred |
| Pendidikan | legacy | Source quality issue (`docs/known-issues.md`: single-source field, rss-kpm) — a different, separate reason from Agama's |
| Teknologi | legacy | May be disproportionately affected by freshness weighting (per the 30% stability shadow result, `docs/editorial-ranking-shadow-evaluation-v1.md`) — not yet reviewed carefully enough to activate |

Each field gets its own pilot decision on its own evidence — Politik
succeeding does not imply the others should follow automatically.

## Editorial Value Dimension backlog (per ChatGPT: collect examples now, do not build yet)

Running list of real cases where the ranking model lacked a signal for
lasting/evergreen value — feeds a future, properly-scoped Editorial
Value Dimension policy, not built ad hoc from one example
(`docs/editorial-value-dimension-discovery.md`):

1. "Ujian buat Imam al-Bukhari di tanah kelahirannya" (Utusan Agama) —
   historical/religious knowledge content, demoted purely for lacking a
   freshness/diversity trigger.
2. Product/gadget announcements (HONOR Robot Phone, etc.) — high
   freshness does not reliably mean high editorial value.
3. Individual-politician personality news (Wong Chen leaving PKR) —
   should only rank up with real national/policy implication, not just
   because it's recent.

Add new examples here as they're found — do not wait for a dedicated
review session.

## Next

Per ChatGPT's exact sequencing: activation (done) → this report
structure (done) → observe Politik in production, adding rows as data
accumulates → collect Editorial Value Dimension examples in the backlog
above → only after sufficient observation, consider a second field's
pilot.
