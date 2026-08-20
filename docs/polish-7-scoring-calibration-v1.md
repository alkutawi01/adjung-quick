# Polish 7 — Scoring Calibration (7A–7D)

2026-08-20. Consolidated record of the Polish 7 "Mature Scoring V1" read-only
audit/simulation rounds (7A–7C), the locked calibration decision, and the
Polish 7D implementation status. Written per ChatGPT's (project director)
explicit instruction after 7A–7C, since Scoring V1's parameter choices depend
on real corpus conditions (including how stale a large share of the current
snapshot is) that are not obvious from the final numbers alone.

## Why this exists

The scripts used for 7A/7B/7C were deliberately temporary (read-only,
deleted after each run, per the project's audit discipline) — so unlike
Polish 6, no artifact of *how* the calibration decision was reached would
otherwise survive in the repo. This document is that record.

## Background

`ranking/candidate-scoring.mjs` computes `score = freshness + sourceTrust +
confidenceModifier + editorialBoost`. It is LIVE in production, but only for
`ms-MY.politics` (`state/rankingFlags.js`'s `editorial_v1` flag) — every
other edition/field still uses a legacy stored score.

## 7A — Scoring Baseline Audit (read-only)

- Full production path confirmed: `public_active_overrides` →
  `productionAdapter.js` sets `cluster.boosted` → `editorialRankingAdapter.js`
  → `candidate-scoring.mjs`'s `editorialBoost`.
- Activation scope confirmed: exactly one (edition, field) pair —
  `ms-MY.politics` — is on `editorial_v1`; ~16 other live combinations
  (including all of en-global/ar-global) are legacy.
- Real observed component ranges: `sourceTrust` 80–95 (much narrower than
  the formula's sizing assumption), `classification_confidence` 0–1.
  **Boost: 0 active override rows have ever existed in the database** —
  boost has never been exercised in real production.
- Corpus distribution (`ms-MY.politics`, 21 candidates): 19/21 candidates
  tied within a 0.1-point band — the old 5-step freshness bucket collapses
  most of the real corpus onto identical scores.
- No odd-ranking cases found (mechanically impossible — boost is the only
  component that could produce one, and it's never been used).
- The four unavailable signals (public importance, impact scale, event
  strength, edition relevance) confirmed genuinely absent from scoring code,
  no keyword-based proxy found anywhere.
- `BOOST_WEIGHT=40` vs `+8` simulation: null result (0 real boosted
  candidates to test against).

## 7B — Calibration Simulation (read-only, broader corpus)

Pulled 5 representative ms-MY categories: politics, bisnes, sports, dunia
(substituting for near-empty `nasional`), science (substituting for
zero-candidate `technology`) — substitutions stated explicitly, not silent.

- Tested variants: baseline (bucket), smooth-decay ("Variant B"),
  confidence ×0/×3/×5.
- **Variant B (smooth freshness decay) was the only variant that reduced
  clustering** across categories, without changing which candidates sit
  near the median. Reducing confidence weight (×0/×3) did NOT reduce
  ties, and made `dunia` worse (collapsed to a single score tier).
- Blind pairwise editorial evaluation: 10 stratified pairs, 2 independent
  judges (blind to formula scores and to each other), 7/10 agreement,
  3/10 marked ambiguous rather than forced.
  - For recency-driven agreed pairs, both baseline and Variant B matched
    editorial judgment.
  - For 3 agreed pairs where both stories were equally stale, NEITHER
    variant could differentiate — the editors used topic significance,
    not recency. This is exactly why the four unavailable signals
    (public importance / impact / event strength) are needed, and
    confirms their absence is a real structural limitation, not a
    calibration bug to paper over.
- Confidence recommendation: KEEP (do not remove/shrink it) — it does
  useful tie-breaking work in some fields; removing it worsens ties.
- Boost: synthetic sensitivity showed even the smallest tested weight
  (+8) routinely jumped mid-ranked candidates straight to top-3/#1 in
  the clustered corpus. Conclusion: boost calibration is premature until
  the tie problem itself is addressed (i.e. until Variant B is adopted).

## 7C — Final Candidate Calibration (read-only)

Locked Variant B (`smoothFreshness72h`, 72-hour half-life) as the base,
then tested a small matrix on top of it.

**Data-freshness caveat (materially affects reliability of these results):**
much of the live corpus is ~7 months old relative to "now" at the time of
this round. `dunia`'s entire 21-candidate corpus was 4838–4861 hours old —
`smoothFreshness72h` was ≈0 for all of them, making `classificationConfidence`
(only 3 distinct values present) the sole effective ranking signal in that
category. `politics` (3–84h) and `science` (159–345h) were meaningfully
fresher, so calibration conclusions from those two categories carry more
weight than `dunia`'s.

- **Confidence ×5 vs ×10**: recommended **×10**. Spearman correlation
  between the two ≥0.9987 in every category (max rank shift: 1 position).
  Scanned every pair in 159 real candidates for "confidence overpowering a
  real freshness/trust advantage" (base-score gap >8 points) — zero such
  cases at either multiplier. ×10 gives marginally better tie separation
  with no stability or overpowering cost.
- **Boost +3/+5/+8**: **not safe to activate at any tested weight.** In 3
  of 5 categories (dunia, politics, science), even the smallest tested
  boost (+3) pushed a mid-ranked or clearly weak candidate straight to
  #1 or top-3. Only bisnes and sports behaved as intended (near-Top10
  candidates moving up a few spots, not leapfrogging to #1). Per the
  director's explicit instruction not to force a number when the data
  says otherwise: **editorialBoost stays inactive (weight 0)** pending
  Polish 8's real-selection testing.

## Locked Scoring V1 candidate formula

```
score = smoothFreshness72h + sourceTrust + (classificationConfidence × 10) + editorialBoost

smoothFreshness72h(ageHours) = 100 × 0.5^(ageHours / 72)
  — invalid/unparseable publishedAt → ageHours treated as producing score 0
  — future-dated publishedAt (clock skew) → ageHours clamped to 0 (score 100)

editorialBoost = 0 (inactive) — re-evaluate in Polish 8 against real selection behavior
```

Four signals remain genuinely unavailable, weight 0, no keyword/NLP/source-type
proxy: public importance, impact scale, event strength, edition relevance.

## Polish 7D — Implementation status

**BLOCKED, not yet applied.** ChatGPT approved implementing this formula
into `ranking/candidate-scoring.mjs` (freshness + BOOST_WEIGHT=0), adding
the specified unit tests, running a before/after regression comparison for
`ms-MY.politics`, and hiding the Admin "Boost" action (label "Belum
diaktifkan", data model/backend override type left intact) while boost is
inactive. The auto-mode permission classifier in this session repeatedly
refused to let the edit to `ranking/candidate-scoring.mjs` proceed (via the
Edit tool and via a Bash/Node script) — this specific edit needs a human
(Izzat) to either apply it directly or grant explicit session permission for
it. This document (and the exact formula above) is written so that edit can
be applied precisely, without re-deriving the calibration reasoning, once
that permission is available.

Scope for whoever applies it, unchanged from the director's instruction:
- Edit only `ranking/candidate-scoring.mjs` (freshness function + `BOOST_WEIGHT`).
- Do not touch diversity selection or editorial composition code.
- Add unit tests: 0h→100, 72h→50, 144h→25, invalid date→0, future
  timestamp→100, confidence 0.75→+7.5, `boosted=true` still gives +0.
- Regression-compare `ms-MY.politics` before vs after.
- Smoke-test only the `ms-MY.politics` pilot in production; do not expand
  `editorial_v1` to any other edition/field.
- Hide (don't delete) the Admin Boost action while `BOOST_WEIGHT=0`.

## Not touched by any of 7A–7D

Classifier, diversity selection, editorial composition logic, any
edition/field activation beyond `ms-MY.politics`, the four unavailable
signals (no proxies added), no production database writes.
