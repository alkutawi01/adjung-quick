// match.js — Tier-1A Deterministic Story-Match Experiment.
// Purely rule-based: normalized token Jaccard similarity + shared significant
// tokens + publish-time proximity. No ML, no embeddings, no training.
//
// This does NOT decide anything by itself — per ChatGPT's directive, output is
// "Story Match Candidate" pairs for human review, not auto-merged duplicates.
// Result feeds a precision/recall measurement, not production behaviour.

const STOPWORDS = new Set([
  // Malay
  'dan', 'yang', 'di', 'ke', 'pada', 'untuk', 'dengan', 'ini', 'itu', 'oleh',
  'akan', 'tidak', 'adalah', 'atau', 'dari', 'dalam', 'ada', 'juga', 'telah',
  'sebagai', 'kerana', 'lebih', 'masih', 'boleh', 'kini', 'satu', 'dua',
  // English
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'to', 'in', 'that', 'for',
  'it', 'with', 'as', 'was', 'are', 'be', 'by', 'has', 'have', 'will',
  'and', 'of', 'says', 'said', 'after', 'over', 'new',
]);

export function tokenize(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // strip punctuation, keep letters/digits (all scripts)
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

export function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(t => setB.has(t));
  const union = new Set([...setA, ...setB]);
  return intersection.length / union.size;
}

// Candidate threshold is intentionally low/inclusive — this is a review tool,
// not a decision maker. False positives are fine here; they cost one human
// "Different" label. False negatives are the thing we actually want to see.
const SIMILARITY_THRESHOLD = 0.15;
const MAX_TIME_DIFF_HOURS = 48;

export function findStoryMatchCandidates(clusters) {
  const candidates = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i].canonical;
      const b = clusters[j].canonical;

      // Only interesting across different sources — same-source dupes are
      // already handled by Tier-0.
      if (a.sourceId === b.sourceId) continue;

      const timeDiffHours = Math.abs(new Date(a.publishedAt) - new Date(b.publishedAt)) / 36e5;
      if (timeDiffHours > MAX_TIME_DIFF_HOURS) continue;

      const tokensA = tokenize(a.title);
      const tokensB = tokenize(b.title);
      const similarity = jaccardSimilarity(tokensA, tokensB);
      if (similarity < SIMILARITY_THRESHOLD) continue;

      const sharedTokens = tokensA.filter(t => tokensB.includes(t));

      candidates.push({
        sourceA: a.sourceName,
        titleA: a.title,
        sourceB: b.sourceName,
        titleB: b.title,
        similarity: Math.round(similarity * 100) / 100,
        sharedTokens: [...new Set(sharedTokens)],
        timeDiffHours: Math.round(timeDiffHours * 10) / 10,
        humanVerdict: '', // to be filled in: Same / Different / Uncertain
      });
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates;
}
