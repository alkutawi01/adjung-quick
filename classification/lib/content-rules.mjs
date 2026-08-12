// content-rules.mjs — Tier 5 evidence: minimal title/description phrase
// rules. Deliberately SMALL, per docs/story-understanding-engine-spec.md:
// "explicitly do not start by writing a large keyword list... start from
// tiers 1-3, add tier 5 rules only where coverage gaps show they're
// actually needed." This is a starting point to validate the pipeline
// shape, not a finished ruleset — expect this file to grow only in
// response to measured gaps (Sesi 3A's coverage/ambiguity test), not
// speculative expansion.
//
// Phrase rules, not single keywords, per lab/classify.js's own lesson
// (word-boundary matching to avoid false hits) and per Izzat's SPRM
// adjudication ("kena rujuk brief juga" — title+description both feed this).

const PHRASE_RULES = [
  // Crime — court/enforcement phrases, real evidence from the 190-item corpus
  { subject: 'Crime', phrases: ['mahkamah', 'didakwa', 'waran tangkap', 'ditahan', 'SPRM', 'dipenjara', 'court', 'charged', 'arrested', 'jailed', 'sentenced', 'مذكرة توقيف', 'محكمة'] },
  // Disaster — acute events, per the locked Bencana definition (distinct from Environment's ongoing conditions)
  { subject: 'Disaster', phrases: ['gempa bumi', 'earthquake', 'banjir besar', 'flood', 'kapal karam', 'ferry capsiz', 'tanah runtuh', 'landslide', 'زلزال', 'فيضان'] },
  // Politics — party/parliament phrases
  { subject: 'Politics', phrases: ['parlimen', 'ahli parlimen', 'menteri', 'parti politik', 'PRU', 'parliament', 'minister', 'election', 'حكومة', 'وزير', 'برلمان'] },
  // Sports — real evidence
  { subject: 'Sports', phrases: ['bola sepak', 'football', 'olympics', 'piala', 'football', 'كرة القدم'] },
  // Health — real evidence
  { subject: 'Health', phrases: ['hospital', 'penyakit', 'vaksin', 'disease', 'vaccine', 'مستشفى', 'مرض'] },
];

export function extractContentEvidence(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const hits = [];
  for (const { subject, phrases } of PHRASE_RULES) {
    const matched = phrases.filter(p => text.includes(p.toLowerCase()));
    if (matched.length) {
      hits.push({ subject, evidence_type: 'title_keyword', value: matched[0] });
    }
  }
  return hits;
}
