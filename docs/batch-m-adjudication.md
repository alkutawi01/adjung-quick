# Batch M Adjudication — Izzat, 2026-08-12

Source: `mixed-evidence-review-batch.mjs` output, 19 items (10 subject,
7 politics/economy, 2 conflict — corrected from an initial mislabeling,
see note below).

## Verdict: ALL 19 CONFIRMED CORRECT

### Conflict cases (2/2) — resolved via URL tie-breaker
Both Guardian UK-heatwave/minister stories (`rss_category:Politics` vs
`url_segment:Environment`) — Izzat picked **Environment (URL wins)** as
primary placement, single placement not dual. See
`docs/edition-rule-engine-contract.md`'s new v1 Conflict Resolution
section and `docs/multi-placement-consideration.md` (deferred to future
capability) for the full reasoning this produced.

### Clean mixed-evidence cases (17/17) — confirmed correct
Presented in two groups; Izzat confirmed both with "betul." after
reviewing the corrected list (Claude initially mislabeled 2 items as
"all Business"/"all Politics" when the raw data actually included one
Entertainment item and one Economy item — corrected before final
confirmation):

- 10 items: 1 Entertainment + 9 Business (feed_category+url_segment
  agreement, confidence 0.98) — TH, RHB-Bursa, PKNS, Panasonic, etc.
- 7 items: 6 Politics + 1 Economy (feed_category/url_segment/rss_category
  agreement, confidence 0.82–1.0) — MP Bersatu/RCI TH, MIDA-Hong Kong,
  PRU-16 calon bayangan, DAP Perak, PKR, Wong Chen, Parlimen membership.

Izzat specifically confirmed the Politics items are genuinely
politics-as-subject (party/election/parliament content), not merely
geography-triggered — the distinction ChatGPT asked to keep separate.

## What this confirms

Per Batch M's purpose (`docs/evidence-calibration-freeze.md` —
"Agreement validation: does multi-mechanism agreement genuinely produce
a trustworthy candidate?"): **YES, confirmed for this sample.** 17/17
non-conflict multi-mechanism-agreement candidates were correct; the 2
conflict cases were correctly resolved by the proposed URL tie-breaker.

## Correction note (process transparency)

Claude's first summary to Izzat incorrectly stated "semua letak Business"
and "semua Politics" for the two groups, missing that item #1 of the
first group was Entertainment and item #2 of the second group was
Economy. Caught and corrected before Izzat's final confirmation — the
corrected, accurate lists are what Izzat actually adjudicated.

## Status

Batch M: **ADJUDICATED, CONFIRMED CORRECT** (19/19). Batch A and Batch M
are now both complete. Batch U and Batch Medium remain pending per
`docs/evidence-calibration-freeze.md`.
