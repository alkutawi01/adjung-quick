// confidence-policy.mjs — Sesi 3B.2C-1, per docs/resolver-confidence-policy.md.
// The Confidence Gate as data, not a hard-coded number in the resolver.
//
// min_subject_confidence: 0.6 is NOT locked — it's the benchmark's starting
// point (classification/benchmark-confidence-threshold.mjs tests 0.40
// through 0.80 against the live corpus before any value gets treated as
// final, per ChatGPT's explicit "jangan pilih 0.6 secara teori sahaja").
//
// low_confidence_action: only 'fallback_geography' is wired up in this
// pass — the A/B/C choice in the contract's §2 (keep / fallback /
// unclassified) is still open; 'fallback_geography' is what ChatGPT's own
// worked example used, so it's what gets benchmarked first.

export const DEFAULT_CONFIDENCE_POLICY = {
  min_subject_confidence: 0.6,
  low_confidence_action: 'fallback_geography',
};

// Per-edition override — empty for now. Per the contract, ms-MY/en/ar may
// reasonably want different thresholds eventually, but that's a hypothesis
// the benchmark hasn't tested yet, not a decision.
export const EDITION_CONFIDENCE_POLICY_OVERRIDES = {};

export function policyForEdition(edition, thresholdOverride) {
  const base = { ...DEFAULT_CONFIDENCE_POLICY, ...(EDITION_CONFIDENCE_POLICY_OVERRIDES[edition] ?? {}) };
  if (thresholdOverride != null) base.min_subject_confidence = thresholdOverride;
  return base;
}

// Confidence Gate Semantics (docs/resolver-confidence-policy.md §1a): this
// never says the candidate is wrong, only that it isn't strong enough to
// drive a DEFAULT placement. Returns { pass: true } or { pass: false,
// action }. The candidate itself is never mutated or discarded by this
// check — the caller decides what 'fail' means.
export function checkConfidenceGate(edition, topSubjectCandidate, thresholdOverride) {
  const policy = policyForEdition(edition, thresholdOverride);
  if (!topSubjectCandidate) return { pass: true, policy };
  if (topSubjectCandidate.confidence >= policy.min_subject_confidence) return { pass: true, policy };
  return { pass: false, action: policy.low_confidence_action, policy };
}
