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
  // Disaster — acute events, per the locked Bencana definition (distinct from Environment's ongoing conditions).
  // Extended 2026-08-13, per docs/niche-field-coverage-audit.md's "Bencana/
  // Kesihatan/Alam Sekitar all-zero" finding: real evidence pulled from
  // production rss_items (haze school closures, storms, wildfires,
  // droughts) that understandStory() returned ZERO candidates for under
  // the original narrow phrase set. 'gempa'/'banjir' added standalone
  // alongside the existing 'gempa bumi'/'banjir besar' because real
  // titles ("Mangsa gempa Colombia...", "...Terjejas Banjir Di Sarawak")
  // don't always carry the longer phrase.
  { subject: 'Disaster', phrases: ['gempa bumi', 'gempa', 'earthquake', 'banjir besar', 'banjir', 'flood', 'kapal karam', 'ferry capsiz', 'tanah runtuh', 'landslide', 'jerebu', 'haze', 'kebakaran hutan', 'wildfire', 'ribut', 'storm', 'kemarau', 'drought', 'cuaca panas ekstrem', 'extreme heat', 'زلزال', 'فيضان'] },
  // Politics — party/parliament phrases
  { subject: 'Politics', phrases: ['parlimen', 'ahli parlimen', 'menteri', 'parti politik', 'PRU', 'parliament', 'minister', 'election', 'حكومة', 'وزير', 'برلمان'] },
  // Sports — real evidence
  { subject: 'Sports', phrases: ['bola sepak', 'football', 'olympics', 'piala', 'football', 'كرة القدم'] },
  // Health — real evidence. 'wabak'/'outbreak' added 2026-08-13 (real gap:
  // Ebola outbreak stories returned zero candidates).
  { subject: 'Health', phrases: ['hospital', 'penyakit', 'vaksin', 'disease', 'vaccine', 'wabak', 'outbreak', 'مستشفى', 'مرض'] },
  // Environment — NEW 2026-08-13, per the same audit: this subject had
  // ZERO content-rule phrases at all before this, only a desk-vocabulary
  // entry ('alam sekitar'/'climate' desk tokens) which never fires for
  // ordinary article titles that just mention climate content in passing.
  // Real evidence: "Wanita perlu dilibatkan dalam agenda perubahan iklim"
  // returned zero candidates pre-fix.
  { subject: 'Environment', phrases: ['perubahan iklim', 'climate change', 'pencemaran', 'pollution', 'kualiti udara', 'air quality'] },
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
