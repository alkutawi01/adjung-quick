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
  // Sports — extended Polish 4B (2026-08-19), per RTM Sukan in-memory
  // simulation: 18/141 RTM Sukan stories fell to unclassified once the
  // Tier 1 source override was removed (real evidence gap, not a reason
  // to keep the wrong override). Every phrase below audited against the
  // full 691-story ms-MY corpus first (precision, not guessed) --
  // 'separuh akhir' ("semifinal") deliberately excluded: 8 matches but
  // 1 false positive (a talent-show elimination round, not sport) --
  // too generic a phrase for any competition type.
  { subject: 'Sports', phrases: ['bola sepak', 'football', 'olympics', 'piala', 'كرة القدم', 'la liga', 'liga super', 'liga pro saudi', 'terbuka australia', 'terbuka itali', 'rali dakar', 'suku akhir', 'raih tiga mata'] },
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
  // Education — NEW Polish 4/10 (2026-08-19), per ChatGPT's classification
  // audit instruction: Pendidikan had ZERO content-rule phrases (and zero
  // classified stories in the live ms-MY corpus) despite this subject
  // having its own taxonomy field (taxonomy-registry.mjs's 'education').
  // Real evidence: pulled 16 production titles containing sekolah/
  // universiti/pelajar/etc from the live corpus during this audit — every
  // one landed in Nasional/Sukan/Hiburan/Jenayah by SOURCE, never by
  // content, because nothing here matched them. Phrases below are the
  // specific, unambiguous terms from that real sample (not invented) --
  // deliberately excludes broader/riskier terms like 'kolej'/'akademia'
  // that weren't directly evidenced this round.
  { subject: 'Education', phrases: ['sekolah', 'universiti', 'pelajar', 'peperiksaan', 'SPM', 'STPM', 'UPSR', 'kementerian pendidikan'] },
  // Economy / Business — NEW Polish 4B (2026-08-19). Neither subject had
  // ANY content-rule phrase before this, despite ms-MY's own taxonomy
  // deliberately keeping them as two SUBJECTS even though both map to
  // one display field (bisnes) -- taxonomy-registry.mjs's locked
  // 'bisnes' entry, subject_codes: ['Business', 'Economy']. Real gap
  // found via RTM Ekonomi in-memory simulation: 23/141 stories lost
  // their Bisnes classification once the Tier 1 source override was
  // removed, several (e.g. "Samsung catat untung 20 trilion won") fell
  // to Dunia (geography-residual) purely for lack of subject evidence.
  // Every phrase audited against the full 691-story corpus first.
  // 'untung' deliberately excluded despite 6/6 clean matches THIS round
  // -- too generic a single word to trust long-term (ChatGPT's call);
  // more specific corporate-earnings phrasing is a follow-up audit.
  { subject: 'Economy', phrases: ['inflasi', 'kdnk', 'kadar faedah', 'ringgit'] },
  { subject: 'Business', phrases: ['bursa malaysia', 'saham'] },
];

// Bug found 2026-08-13 (live, post-launch): some sources (e.g.
// rss-astro-awani) store `description` as raw, uncleaned HTML —
// including full <img> tag attributes. A real story about Trump/Selat
// Hormuz was misclassified Health because its description's <img
// alt="...an event to sign an executive order regarding vaccine
// flexibility..."> — an unrelated photo caption for a DIFFERENT past
// event, embedded as markup, not real article content — contained the
// word "vaccine". Strip HTML tags (and everything inside their angle
// brackets, including attributes) before content-rule matching, so
// markup can never masquerade as real title/description text.
function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, ' ');
}

export function extractContentEvidence(title, description) {
  const text = `${stripHtml(title)} ${stripHtml(description)}`.toLowerCase();
  const hits = [];
  for (const { subject, phrases } of PHRASE_RULES) {
    const matched = phrases.filter(p => text.includes(p.toLowerCase()));
    if (matched.length) {
      hits.push({ subject, evidence_type: 'title_keyword', value: matched[0] });
    }
  }
  return hits;
}
