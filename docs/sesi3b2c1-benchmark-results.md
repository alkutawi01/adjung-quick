# Sesi 3B.2C-1 — Confidence Threshold Benchmark Results

Status: benchmark run, real 284-item corpus. Per
`docs/resolver-confidence-policy.md` §5 — measures, does not lock a
threshold. Run: `node classification/benchmark-confidence-threshold.mjs`.

## Implementation (matches the contract, no scope creep)

- `classification/lib/confidence-policy.mjs` — `DEFAULT_CONFIDENCE_POLICY
  = { min_subject_confidence: 0.6, low_confidence_action:
  'fallback_geography' }`, per-edition override object (empty for now),
  `checkConfidenceGate()` per the Confidence Gate Semantics locked in the
  contract (§1a) — never discards the candidate, only gates whether it
  can drive a *default* placement.
- `classification/edition-classification.mjs` — new Tier 2.5, between
  Edition Rules and Default Placement Mapping, exactly where the contract
  specified. `classifyForEdition`/`classifyForAllEditions` take an
  optional `thresholdOverride` so the benchmark can sweep values without
  mutating shared state. Ruleset bumped to v1.3.0.
- Confirmed `foreign_politics_to_world` still fires regardless of subject
  confidence — an explicit rule is never second-guessed by the gate, per
  contract §4. No keywords, no taxonomy, no entity detection, no Story
  Understanding changes — matches the scope ChatGPT set.

## The headline finding: unclassified rate does NOT move with threshold

The contract's own illustrative table (written before any real numbers
existed) assumed unclassified% would rise as the threshold rises. The
real data shows something different:

| threshold | ms-MY classified | ms-MY unclassified | default_mapping | low_confidence_fallback |
|---|---|---|---|---|
| 0.40 | 67% | 33% | 156 | 0 |
| 0.50 | 67% | 33% | 135 | 21 |
| 0.60 | 67% | 33% | 135 | 21 |
| 0.70 | 67% | 33% | 135 | 21 |
| 0.80 | 67% | 33% | 128 | 28 |

(en/ar show the same pattern — see raw output for their tables.)

**Unclassified stays flat at 33% across every threshold tested.** Raising
the threshold doesn't push more stories into "no answer" — it reroutes
them from subject-based `default_mapping` to geography-based
`low_confidence_fallback`, because almost every story already carries
*some* geography candidate. The gate rarely finds nothing to fall back to.

This matters for §2's open A/B/C question in the contract:
`low_confidence_action: "fallback_geography"` is cheap to raise — it
barely touches the unclassified rate — but that also means it isn't
distinguishing "genuinely ambiguous story" from "clear story, weak
subject phrasing" the way a stricter policy might. Whether that's good
(fewer stories lost) or bad (weak candidates hidden behind a
geography label instead of surfaced as uncertain) is an editorial call,
not something this benchmark alone can answer.

## What this benchmark does NOT answer yet

Per the contract's own distinction (§5): **technical error vs editorial
disagreement** requires human judgment, not engine output. This script
produced the sample — 52 Gap-3 (confidence < 0.5) cases + 20 stride-sampled
control cases, 72 total — with `chief_editor_judgement` and
`technical_error_or_editorial_preference` left blank for Izzat/ChatGPT to
fill in. Full sample: raw benchmark output (not committed — regenerate
via the script; it's not stable/meaningful to freeze as a doc since the
live RSS corpus changes between runs).

## Recommendation (not a lock)

Given unclassified% is threshold-insensitive in this range, the more
consequential choice is `low_confidence_action` itself (§2's A/B/C), not
the exact numeric threshold. Suggest reviewing the manual sample before
spending more effort tuning `0.4` vs `0.6` vs `0.8` — the number matters
less than which of A/B/C is editorially correct.

## Explicitly out of scope for 3B.2C-1

- No threshold locked — `0.6` remains the default, unconfirmed.
- No `low_confidence_action` other than `fallback_geography` implemented.
- No manual judgments filled in — that's a human task, not automatable.
- No per-edition threshold override set — the hypothesis in the contract
  (ms-MY conservative / en permissive) is untested by this benchmark,
  since it swept the same threshold across all editions uniformly.
