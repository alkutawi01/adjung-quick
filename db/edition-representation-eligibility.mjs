// edition-representation-eligibility.mjs — the Edition Representation
// Eligibility Gate, per docs/edition-representation-eligibility-policy.md.
//
// Deliberately a tiny, pure, standalone function — sits in the production
// wiring layer (db/classify-production.js calls it), NOT inside the frozen
// classification engine (classification/story-understanding.mjs,
// classification/edition-classification.mjs stay untouched). Story
// Understanding stays language-neutral; this is the one place that decides
// whether an edition's PLACEMENT should be attempted at all.
//
// A cluster is eligible for an edition only if at least one of its member
// items is actually written in that edition's own locale. This prevents
// exactly the bug found live (2026-08-13): a Malay-only Utusan Agama story
// getting a "Religion"/"دين" placement row in en-global/ar-global despite
// having zero English/Arabic representation — technically-present rows
// that were always going to be invisible in the UI (Edition Locale
// Authority, docs/edition-state-model.md), making the coverage numbers
// lie about what readers can actually see.
export function isEditionEligible(cluster, locale) {
  return (cluster?.members ?? []).some(m => m.language === locale);
}
