// story-understanding.mjs — Sesi 3A implementation, per
// docs/story-understanding-engine-spec.md.
//
// Turns one RSS item into candidate signals — NEVER a resolved
// field/category. Multiple, possibly conflicting, candidates are the
// correct output when the evidence is genuinely ambiguous; forcing a
// single answer here would be doing Edition Classification's job (Sesi 3B,
// not built yet) inside this layer, which is exactly the mistake this
// whole pivot was fixing.
//
// Evidence hierarchy (docs/source-registry-v2-audit.md):
//   1. Publisher-declared category/feed (incl. Bernama's title-prefix variant)
//   2. URL structure
//   3. RSS <category> tag
//   4. Entity detection — NOT IMPLEMENTED (explicitly out of scope, spec §4)
//   5. Title/description content rules (deliberately minimal, see content-rules.mjs)

import { SUBJECT_VOCABULARY, GEOGRAPHY_VOCABULARY, STRUCTURAL_NOISE, normalizeToken } from './lib/desk-vocabulary.mjs';
import { extractContentEvidence } from './lib/content-rules.mjs';
import { extractBernamaPrefix } from './lib/bernama-prefix.mjs';

// Tier base confidences — RANKING STRENGTH, not real probabilities. A 0.9
// here means "trust this more than a 0.4", not "90% chance this is true".
//
// url_path > publisher_declared (2026-08-16, per Izzat's explicit product
// rule + ChatGPT's approval, confidence 0.98): found live — RTM's
// "specialised" feeds (rss.app relay) declare a single category per feed
// (e.g. rss-rtm-hiburan) but the underlying items are NOT purely that
// category (81% of rss-rtm-hiburan items were, by their own URL, actually
// jenayah/nasional/ekonomi/etc — a rasuah/court story appeared under
// "Hiburan" this way). The item's own URL is ground truth for what RTM
// itself classified it as; a feed's blanket declared category is a
// weaker, aggregate-level signal that can be wrong per-item. This only
// changes the OUTCOME when the two tiers genuinely disagree on subject —
// when url_path has no hit, publisher_declared still wins by default,
// unchanged from before.
const TIER_CONFIDENCE = {
  url_path: 0.90,
  publisher_declared: 0.75,
  rss_category: 0.70,
  title_keyword: 0.40,
};

function deskFromUrl(link) {
  try {
    const segs = [];
    for (const s of new URL(link).pathname.split('/').filter(Boolean)) {
      if (/^\d+$/.test(s)) break;
      if (s.length > 40) break;
      if (s.split('-').length > 4) break;
      segs.push(s);
    }
    return segs.slice(0, 2);
  } catch {
    return [];
  }
}

function lookupToken(token) {
  const t = normalizeToken(token);
  if (!t || STRUCTURAL_NOISE.has(t)) return { subject: null, geography: null, noise: STRUCTURAL_NOISE.has(t) };
  return {
    subject: SUBJECT_VOCABULARY[t] ?? null,
    geography: GEOGRAPHY_VOCABULARY[t] ?? null,
    noise: false,
  };
}

// item: { title, description, link, categories?, sourceName, sourceKnownCategory? }
// sourceKnownCategory: optional, set when the FEED ITSELF is a publisher-
// declared category feed (e.g. Harian Metro's bisnes.xml) — not yet wired
// into lab/sources.js (flagged in source-registry-v2-audit.md), so this
// stays undefined for all current real ingestion until that's done.
export function understandStory(item) {
  const subjectHits = [];
  const geographyHits = [];

  // --- Tier 1: publisher-declared ---
  if (item.sourceKnownCategory) {
    const looked = lookupToken(item.sourceKnownCategory);
    if (looked.subject) subjectHits.push({ subject: looked.subject, tier: 'publisher_declared', evidence_type: 'feed_category', value: item.sourceKnownCategory });
    if (looked.geography) geographyHits.push({ geography: looked.geography, tier: 'publisher_declared', evidence_type: 'feed_category', value: item.sourceKnownCategory });
  }
  // Bernama title-prefix variant of Tier 1
  const bernama = extractBernamaPrefix(item.title);
  if (bernama.subject) subjectHits.push({ subject: bernama.subject, tier: 'publisher_declared', evidence_type: 'title_prefix', value: bernama.rawPrefix });
  if (bernama.geography) geographyHits.push({ geography: bernama.geography, tier: 'publisher_declared', evidence_type: 'title_prefix', value: bernama.rawPrefix });

  // --- Tier 2: URL structure ---
  for (const seg of deskFromUrl(item.link)) {
    const looked = lookupToken(seg);
    if (looked.subject) subjectHits.push({ subject: looked.subject, tier: 'url_path', evidence_type: 'url_segment', value: seg });
    if (looked.geography) geographyHits.push({ geography: looked.geography, tier: 'url_path', evidence_type: 'url_segment', value: seg });
  }

  // --- Tier 3: RSS <category> ---
  for (const cat of item.categories ?? []) {
    const looked = lookupToken(cat);
    if (looked.subject) subjectHits.push({ subject: looked.subject, tier: 'rss_category', evidence_type: 'rss_category', value: cat });
    if (looked.geography) geographyHits.push({ geography: looked.geography, tier: 'rss_category', evidence_type: 'rss_category', value: cat });
  }

  // --- Tier 4: entity detection — not implemented, per spec ---

  // --- Tier 5: content rules (minimal) ---
  // Bug found 2026-08-13 during niche-field calibration: extractBernamaPrefix
  // strips ANY "X: rest" colon-prefix pattern, not just recognized Bernama
  // prefixes (business/sports/sukan/world/dunia) — so a non-Bernama
  // headline like "Jerebu: Malaysia perlu..." silently lost "Jerebu" from
  // Tier 5 content matching entirely. Only use the stripped title when the
  // prefix was actually recognized as a real Bernama subject/geography
  // signal; otherwise the colon-prefix is real title content, not noise.
  const bernamaPrefixRecognized = Boolean(bernama.subject || bernama.geography);
  const titleForContent = bernamaPrefixRecognized ? bernama.strippedTitle : item.title;
  for (const hit of extractContentEvidence(titleForContent, item.description)) {
    subjectHits.push({ subject: hit.subject, tier: 'title_keyword', evidence_type: hit.evidence_type, value: hit.value });
  }

  return {
    subject_candidates: aggregate(subjectHits, 'subject'),
    geography_candidates: aggregate(geographyHits, 'geography'),
  };
}

// Combine same-value hits across tiers via noisy-OR (independent evidence
// stacks confidence without exceeding 1), then rank descending. Ties
// broken by tier priority order (earlier tier wins) for stable output.
function aggregate(hits, key) {
  const byValue = new Map();
  for (const hit of hits) {
    const value = hit[key];
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(hit);
  }
  const candidates = [...byValue.entries()].map(([value, valueHits]) => {
    let notAllWrong = 1;
    for (const h of valueHits) notAllWrong *= (1 - TIER_CONFIDENCE[h.tier]);
    const confidence = Math.round((1 - notAllWrong) * 100) / 100;
    return {
      value,
      confidence,
      evidence: valueHits.map(h => ({ evidence_type: h.evidence_type, value: h.value })),
    };
  });
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates;
}
