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

// Per-subject override — added 2026-08-13, per Izzat's direct decision
// after the niche-field calibration found that Disaster/Environment/
// Health's real vocabulary (classification/lib/content-rules.mjs) is
// Tier 5 ONLY for ms-MY sources (mainstream Malay newsrooms have no
// dedicated "bencana"/URL-desk structure to corroborate via Tier 2/3,
// unlike Guardian/Al Jazeera's literal /environment/ URL paths) — so a
// single Tier 5 hit (0.4) can never clear the default 0.6 gate,
// permanently keeping these Bidang at zero regardless of vocabulary.
// Lowered specifically for these three subjects, not globally, to avoid
// raising noise for subjects (Politics, Crime, etc.) that already clear
// the gate via stronger tiers. 0.35 is deliberately just under a single
// content-rule hit's 0.4 — not a re-run benchmark like the original 0.6,
// a targeted unblock; revisit if false-positive reports come in (see
// docs/niche-field-coverage-audit.md's "kemarau emas" disclosed risk).
export const SUBJECT_CONFIDENCE_OVERRIDES = {
  Disaster: 0.35,
  Environment: 0.35,
  Health: 0.35,
};

// Per-edition + per-subject override — NEW Polish 4B (2026-08-19). Same
// exact gap as SUBJECT_CONFIDENCE_OVERRIDES above (a single Tier 5 hit
// at 0.4 can't clear the 0.6 default), found via the RTM Ekonomi
// in-memory simulation ("Samsung catat untung..." -- real Tier 5
// evidence, still fell to Dunia). Deliberately EDITION-SCOPED (not added
// to the global SUBJECT_CONFIDENCE_OVERRIDES above) because the evidence
// gap is specific to ms-MY mainstream sources having no dedicated
// /bisnes/ URL-desk structure to corroborate via Tier 2/3 -- en-global/
// ar-global's Business/Economy sources (BBC/Guardian/Al Jazeera) DO have
// that structural evidence and clear 0.6 fine already, so a global
// override would needlessly loosen those editions too.
export const EDITION_SUBJECT_CONFIDENCE_OVERRIDES = {
  'ms-MY': {
    Business: 0.35,
    Economy: 0.35,
  },
};

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
//
// Precedence (Polish 4B): edition+subject override -> global subject
// override -> edition/default threshold. DEFAULT_CONFIDENCE_POLICY.
// min_subject_confidence (0.6) itself is UNCHANGED -- per ChatGPT's
// explicit instruction, only these two override layers move.
export function checkConfidenceGate(edition, topSubjectCandidate, thresholdOverride) {
  const policy = policyForEdition(edition, thresholdOverride);
  if (!topSubjectCandidate) return { pass: true, policy };
  const effectiveThreshold = EDITION_SUBJECT_CONFIDENCE_OVERRIDES[edition]?.[topSubjectCandidate.value]
    ?? SUBJECT_CONFIDENCE_OVERRIDES[topSubjectCandidate.value]
    ?? policy.min_subject_confidence;
  if (topSubjectCandidate.confidence >= effectiveThreshold) return { pass: true, policy };
  return { pass: false, action: policy.low_confidence_action, policy };
}
