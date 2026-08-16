// rankingFlags.js — Editorial Ranking Engine feature flag, per
// docs/editorial-ranking-activation-policy-v1.md §5. Config-driven,
// never a hardcoded field check inline in the reducer/adapter — so
// activating a new (edition, field) is a config change here, not a
// code change elsewhere.
//
// Every (edition, field) not listed defaults to 'legacy'.
//
// Taxonomy Stable Field-ID V1 (2026-08-16, docs/taxonomy-stable-field-id-design-v1.md):
// keyed on field_code ('politics'), not the mutable label ('Politik') —
// found live as a real fragility: a Bidang rename would have silently
// deactivated this pilot (falls back to 'legacy', no error). field_code
// never changes on rename, so this config now survives one.
export const RANKING_FLAGS = {
  'ms-MY': {
    politics: 'editorial_v1',
  },
};

export function getRankingVersion(editionId, fieldCode) {
  return RANKING_FLAGS[editionId]?.[fieldCode] ?? 'legacy';
}
