// scoring-v1-simulation.mjs — Editorial Ranking Engine, Scoring V1
// (simulation only, NOT wired into production).
//
// Pusingan 11/15 continued (2026-08-19), per Izzat's direct instruction
// relayed through ChatGPT: "awak kan AI, guna kemampuan AI utk menilai...
// Quick patut datang dengan judgement editorial lalai yang baik. Izzat
// hanya menyunting judgement itu, bukan membina otaknya dari kosong."
//
// This is a PURE function, deliberately separate from ranking/candidate-
// scoring.mjs (the real, LIVE-in-production formula for ms-MY.Politik).
// candidate-scoring.mjs is UNTOUCHED by this file -- comparing old vs new
// is exactly the point, and production must keep running the old formula
// until a human reviews this simulation's results.
//
// HONESTY CONSTRAINT (explicit instruction: "jangan cipta pseudo-AI"):
// of Izzat's 9 requested factors, only 5 have a real, derivable signal in
// this codebase today. The other 4 are declared, weighted 0, and marked
// inactive below -- not silently dropped, not faked with a placeholder
// number. See WEIGHTS' own comments for exactly why each one is or isn't
// measurable.
//
//   Measurable (implemented):
//     - Kebaruan (freshness) -- publishedAt, decay rate now VARIES by
//       field_code (a real, derivable per-story signal via
//       edition_story_classifications.field_code), not one flat curve
//       for every story the way candidate-scoring.mjs's single
//       FRESHNESS_BUCKETS table does.
//     - Kepercayaan sumber (source trust) -- sources.trust_score, same
//       column candidate-scoring.mjs already uses.
//     - Keyakinan pengelasan (classification confidence) -- same column
//       candidate-scoring.mjs already uses, kept small/secondary per its
//       own established reasoning (measures evidence certainty, not
//       story importance).
//     - Boost editor -- same story_overrides boost flag candidate-
//       scoring.mjs already uses.
//     - Penalti pertindihan/reaksi berulang -- REAL signal: how many
//       other stories in the same field, within a short window, have a
//       near-duplicate title (reuses diversity-selection.mjs's own
//       titleSimilarity() -- not reimplemented, imported).
//
//   NOT measurable today (weight 0, inactive, no proxy invented):
//     - Kepentingan awam (public importance/reach) -- no audience/reach
//       metadata exists anywhere in this schema.
//     - Skala kesan (national > state > local) -- GEOGRAPHY_VOCABULARY
//       detects WHICH place is mentioned (structural evidence), never
//       the SCALE of the story's consequence. Treating "mentions Kuala
//       Lumpur" as "national impact" would be exactly the pseudo-AI
//       leap this instruction forbids.
//     - Kekuatan peristiwa (official decision/disaster/death magnitude)
//       -- content-rules.mjs's phrase rules detect a SUBJECT (Disaster,
//       Crime, ...), never the MAGNITUDE of a specific event within that
//       subject. A small local accident and a major disaster both match
//       "Disaster" identically today.
//     - Kerelevanan kepada edisi (beyond field placement itself) -- a
//       story already being classified into an ms-MY field IS the
//       edition-relevance signal that exists; there is no separate
//       "how Malaysia-relevant" gradient stored anywhere.

import { titleSimilarity } from './diversity-selection.mjs';

// Per-field freshness decay -- an editorial judgment call (explicitly
// authorized: "Laraskan parameter sendiri... tak perlu tanya Izzat untuk
// setiap nombor"), grounded in a real, ordinary newsroom distinction: a
// crime/sports story's news value drops fast (same-day relevance), a
// disaster's stays elevated longer (aftermath coverage), most fields sit
// in between, and evergreen-leaning fields (culture/lifestyle/science)
// decay slowest. Reuses field_code, a REAL stored value -- not a reason
// to invent a new "news type" classifier.
const FIELD_DECAY_PROFILE = {
  crime: 'fast', sports: 'fast', entertainment: 'fast',
  disaster: 'slow', health: 'slow',
  culture: 'evergreen', lifestyle: 'evergreen', science: 'evergreen', religion: 'evergreen', education: 'evergreen',
  // everything else (politics, bisnes, dunia, nasional, environment, technology, and any unmapped field_code) -> 'normal'
};

// Iteration 1 (2026-08-19, per real simulation output): the first 'fast'
// curve zeroed out completely past 24h -- against real ms-MY sample data
// this crashed two genuinely notable SUKMA record-breaking stories from
// #3/#4 (old formula) to #125/#126, a collapse too severe for a "still
// worth reading a few days later" sports story. Softened with a 3-day
// tail bucket instead of an immediate cliff to 0, while keeping 'fast'
// meaningfully steeper than 'normal' in the first 24h.
// Iteration 2 (2026-08-19, per real simulation output): checked the
// exact real story that iteration 1 still crashed (a SUKMA record story,
// published_at confirmed 44h before test run) -- 44h fell into the 24-72h
// tail bucket, worth only 4/25 (16% of ceiling), too steep a drop for a
// still-recent (under 2 days) sports story. Graduated the curve further
// instead of one cliff at 24h.
const DECAY_CURVES = {
  fast: [{ maxHours: 3, score: 25 }, { maxHours: 12, score: 18 }, { maxHours: 24, score: 12 }, { maxHours: 48, score: 8 }, { maxHours: 24 * 4, score: 3 }, { maxHours: Infinity, score: 0 }],
  normal: [{ maxHours: 6, score: 25 }, { maxHours: 24, score: 20 }, { maxHours: 24 * 3, score: 12 }, { maxHours: 24 * 7, score: 4 }, { maxHours: Infinity, score: 0 }],
  slow: [{ maxHours: 12, score: 25 }, { maxHours: 24 * 2, score: 22 }, { maxHours: 24 * 5, score: 16 }, { maxHours: 24 * 10, score: 6 }, { maxHours: Infinity, score: 0 }],
  evergreen: [{ maxHours: 24, score: 20 }, { maxHours: 24 * 7, score: 16 }, { maxHours: 24 * 21, score: 10 }, { maxHours: Infinity, score: 4 }],
};

function freshnessScoreV1(publishedAt, fieldCode, now) {
  const hours = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  if (Number.isNaN(hours)) return 0;
  const profile = FIELD_DECAY_PROFILE[fieldCode] ?? 'normal';
  const bucket = DECAY_CURVES[profile].find(b => hours <= b.maxHours);
  return bucket.score;
}

// Weight ceilings, kept in the 0-100 scale Izzat proposed. Documented as
// data (not buried magic numbers) so this can become the Admin-editable
// "Faktor | Berat | Aktif/Tidak | Laras" table in a future round, per his
// explicit request.
export const SCORING_V1_WEIGHTS = [
  { faktor: 'Kebaruan (susut ikut bidang)', berat: 25, aktif: true, laras: 'field_code-dependent decay curve, lihat FIELD_DECAY_PROFILE' },
  { faktor: 'Kepercayaan sumber', berat: 20, aktif: true, laras: 'terus drpd sources.trust_score / 100 * 20' },
  { faktor: 'Kepentingan awam', berat: 0, aktif: false, laras: 'BELUM TERSEDIA -- tiada metadata capaian/audiens' },
  { faktor: 'Skala kesan (negara/negeri/komuniti)', berat: 0, aktif: false, laras: 'BELUM TERSEDIA -- geografi kesan struktur sumber sahaja, bukan skop akibat' },
  { faktor: 'Kekuatan peristiwa', berat: 0, aktif: false, laras: 'BELUM TERSEDIA -- content-rules kesan SUBJEK, bukan MAGNITUD' },
  { faktor: 'Kebaharuan maklumat (bukan ulangan)', berat: 10, aktif: true, laras: 'penalti tertindih -- lihat duplicationPenalty()' },
  { faktor: 'Kerelevanan kepada edisi', berat: 0, aktif: false, laras: 'BELUM TERSEDIA -- placement bidang itu sendiri SUDAH signal ini' },
  { faktor: 'Keyakinan pengelasan', berat: 5, aktif: true, laras: 'classification_confidence x5, kecil/sekunder (sama falsafah candidate-scoring.mjs)' },
  // Iteration 3 (2026-08-19, Pusingan 12 -- ujian sensitiviti sebenar):
  // +40 (nilai production lama) DISAHKAN keterlaluan selepas sourceTrust
  // dinormal ke 0-20 -- julat skor V1 dalam satu bidang jadi jauh lebih
  // padat (~30-55), jadi +10 SAHAJA sudah cukup lonjakkan berita
  // pertengahan terus ke #1 dalam hampir setiap bidang diuji. Ini
  // melanggar prinsip candidate-scoring.mjs SENDIRI: "boost must raise
  // the CHANCE of selection, never guarantee it... A weight large enough
  // to always win would make boost a pin in disguise." +8 dipilih --
  // cukup kuat utk beri kelebihan ketara, tapi tidak menjamin #1 tanpa
  // mengira apa-apa lagi. BELUM diuji terhadap data boost SEBENAR (sifar
  // berita boosted wujud dalam sampel semasa) -- ujian di atas guna
  // simulasi hipotesis sahaja, bukan penggunaan sebenar; laras semula
  // bila ada override boost sebenar utk diperhatikan.
  { faktor: 'Keutamaan editor (boost)', berat: 8, aktif: true, laras: 'flat +8 bila override boost aktif -- diturunkan drpd +40 selepas ujian sensitiviti sebenar, lihat komen' },
];

// Real, derivable "duplication/reaction" signal: how many OTHER stories
// in the same scoring batch have a near-duplicate title (reuses
// diversity-selection.mjs's own Jaccard-similarity function, not a new
// algorithm). A story with 4+ near-duplicates in the batch is heavy
// pack coverage/reaction-piece territory -- penalized, capped so a
// single very-covered story can't zero out.
function duplicationPenalty(candidate, allTitles) {
  const dupCount = allTitles.filter(t => t !== candidate.title && titleSimilarity(t, candidate.title) >= 0.6).length;
  if (dupCount === 0) return 10; // unique story: full marks on this factor
  return Math.max(0, 10 - dupCount * 3);
}

// Pusingan 12/15's recommended ceilings, as data -- the SAME numbers
// SCORING_V1_WEIGHTS' `berat` column carries, just keyed for direct use
// as scoreCandidateV1()'s default `weights` argument. Exported Pusingan
// 13/15 so ui/src/admin/KaedahNilaiPanel.jsx's "Reset ke V1" button loads
// these exact values -- never a re-typed copy that could drift from the
// policy doc.
export const DEFAULT_SCORING_V1_WEIGHTS = {
  freshnessCeiling: 25,
  trustCeiling: 20,
  duplicationCeiling: 10,
  confidenceMultiplier: 5,
  boostWeight: 8,
};

// candidate: { storyId, title, sourceId, publishedAt, trustScore, classificationConfidence, boosted, fieldCode }
// allTitles: every candidate's title in the same batch (for duplication signal)
// weights: optional ceiling/multiplier overrides (Pusingan 13/15, for
// KaedahNilaiPanel's live simulation slider). Omitted/partial entries
// fall back to DEFAULT_SCORING_V1_WEIGHTS -- calling this with no 4th
// arg reproduces EXACTLY Pusingan 12's script behavior, unchanged.
// Freshness/duplication are computed at their DESIGNED 0-25/0-10 shape
// first, then proportionally rescaled to the requested ceiling -- the
// CURVE SHAPE (field-dependent decay, near-duplicate detection) is
// Pusingan 12's calibrated design and is never touched by a ceiling
// slider, only its magnitude.
export function scoreCandidateV1(candidate, allTitles, now = new Date(), weights = {}) {
  const w = { ...DEFAULT_SCORING_V1_WEIGHTS, ...weights };
  const freshnessBase = freshnessScoreV1(candidate.publishedAt, candidate.fieldCode, now); // 0-25 designed shape
  const freshness = freshnessBase * (w.freshnessCeiling / DEFAULT_SCORING_V1_WEIGHTS.freshnessCeiling);
  const sourceTrust = ((candidate.trustScore ?? 0) / 100) * w.trustCeiling;
  const duplicationBase = duplicationPenalty(candidate, allTitles); // 0-10 designed shape
  const duplication = duplicationBase * (w.duplicationCeiling / DEFAULT_SCORING_V1_WEIGHTS.duplicationCeiling);
  const confidenceModifier = (candidate.classificationConfidence ?? 0) * w.confidenceMultiplier;
  const editorialBoost = candidate.boosted ? w.boostWeight : 0;

  const score = freshness + sourceTrust + duplication + confidenceModifier + editorialBoost;
  return {
    ...candidate,
    scoreV1: score,
    breakdownV1: { freshness, sourceTrust, duplication, confidenceModifier, editorialBoost },
  };
}
