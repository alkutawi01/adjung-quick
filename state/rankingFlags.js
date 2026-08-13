// rankingFlags.js — Editorial Ranking Engine feature flag, per
// docs/editorial-ranking-activation-policy-v1.md §5. Config-driven,
// never a hardcoded field check inline in the reducer/adapter — so
// activating a new (edition, field) is a config change here, not a
// code change elsewhere.
//
// Every (edition, field) not listed defaults to 'legacy'.

export const RANKING_FLAGS = {
  'ms-MY': {
    Politik: 'editorial_v1',
  },
};

export function getRankingVersion(editionId, field) {
  return RANKING_FLAGS[editionId]?.[field] ?? 'legacy';
}
