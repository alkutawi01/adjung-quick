// precedence-fix-regression.test.mjs — Global Phase 4B-D (2026-08-21,
// docs/global-edition-decision-v1.md).
//
// Regression coverage for the precedence bug found right after Phase
// 4B-C's Tier 5 geography extension shipped: 5 real ms-MY stories that
// used to resolve via Tier 3 (Default Placement Mapping — Sukan/Politik/
// Jenayah) got silently downgraded to generic Nasional, because a newly-
// populated weak 'Malaysia' geography candidate (from generic words like
// "malaysia"/"negara" in the title) made the Confidence Gate's early
// geography-residual return fire BEFORE Tier 3 ever ran. Fixed in
// edition-classification.mjs by removing that early return — Tier 3 now
// always gets a chance to find a specific mapping first.
//
// Fixtures below are representative of the 5 real failure classes (Sports,
// Politics, Crime), not the literal headlines — same defect class, real
// PHRASE_RULES/GEOGRAPHY_VOCABULARY tokens, not invented ones.

import { understandStory } from './story-understanding.mjs';
import { classifyForEdition } from './edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nPRECEDENCE FIX REGRESSION — Global Phase 4B-D\n');

// A weak subject signal (title_keyword tier, 0.40 confidence — below the
// 0.6 default gate threshold) CO-OCCURRING with a weak generic geography
// signal ('malaysia' the word, also title_keyword tier) must still resolve
// via Tier 3's specific default mapping, not the geography residual.
const CASES = [
  { label: 'Sports', title: 'Skuad piala Malaysia gagal ke pusingan akhir', expectField: 'Sukan' },
  { label: 'Politics', title: 'Menteri di Malaysia umum pelan baharu', expectField: 'Politik' },
  { label: 'Crime', title: 'Seorang ditahan SPRM di negara ini atas salah guna kuasa', expectField: 'Jenayah' },
];

for (const c of CASES) {
  const understanding = understandStory({
    title: c.title, description: '', link: 'https://example.com/ms/berita', categories: [],
    sourceName: 'test',
  });
  const hasWeakSubject = understanding.subject_candidates.some(s => s.value === c.label && s.confidence < 0.6);
  const hasGeo = understanding.geography_candidates.some(g => g.value === 'Malaysia');
  check(`fixture "${c.title}" produces a weak (${'<0.6'}) ${c.label} subject candidate AND a Malaysia geography candidate (reproduces the exact precondition of the bug)`,
    hasWeakSubject && hasGeo,
    `subjects: ${JSON.stringify(understanding.subject_candidates)}, geo: ${JSON.stringify(understanding.geography_candidates)}`);

  const result = classifyForEdition(understanding, 'ms-MY');
  check(`"${c.title}" resolves to ${c.expectField} (Tier 3 default mapping), NOT the generic Nasional geography residual`,
    result.field === c.expectField && result.classification_method === 'default_mapping',
    `got: field=${result.field}, method=${result.classification_method}`);
}

// Sanity: the geography-residual fallback must still work when there is
// genuinely NO subject candidate at all (true last-resort case, untouched
// by this fix).
{
  const understanding = understandStory({
    title: 'Perkembangan terkini di Malaysia hari ini',
    description: '', link: 'https://example.com/ms/berita', categories: [],
    sourceName: 'test',
  });
  const result = classifyForEdition(understanding, 'ms-MY');
  check('a story with a geography candidate but NO subject candidate at all still resolves via geography_fallback (Nasional)',
    result.field === 'Nasional' && result.classification_method === 'geography_fallback',
    `got: field=${result.field}, method=${result.classification_method}, subjects=${JSON.stringify(understanding.subject_candidates)}`);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
