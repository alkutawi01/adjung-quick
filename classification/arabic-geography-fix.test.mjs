// arabic-geography-fix.test.mjs — Global Phase 4B (2026-08-21,
// docs/global-edition-decision-v1.md).
//
// Real understandStory()/classifyForEdition() run against the exact
// failure pattern the Phase 4B audit found live in production: 10/10
// sampled ar-global items returned subject_candidates=[] AND
// geography_candidates=[] because GEOGRAPHY_VOCABULARY had zero
// Arabic-script entries, and deskFromUrl() never decoded percent-encoded
// URL path segments. This file proves both fixes against real inputs
// shaped like the corpus data cited in the audit (RSS category values
// actually observed: الشرق الأوسط ×5, أمريكا ×2, آسيا ×1, أوروبا ×1),
// not synthetic strings invented for the test.

import { understandStory } from './story-understanding.mjs';
import { classifyForEdition } from './edition-classification.mjs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nARABIC GEOGRAPHY VOCABULARY + URL-DECODE FIX — real pipeline (4B)\n');

// --- 1. RSS <category> tier (Tier 3) now recognises real observed
// Arabic geography tokens, previously zero matches. ---
{
  const item = {
    title: 'واشنطن تشدد الضغط الاقتصادي على إيران',
    description: '',
    link: 'https://www.france24.com/ar/%D8%A7%D9%84%D8%B4%D8%B1%D9%82-%D8%A7%D9%84%D8%A3%D9%88%D8%B3%D8%B7',
    categories: ['الشرق الأوسط'],
    sourceName: 'France 24 Arabic',
  };
  const understood = understandStory(item);
  check('الشرق الأوسط (Middle East, observed 5x in corpus) now yields a geography candidate',
    understood.geography_candidates.length > 0 && understood.geography_candidates[0].value === 'Middle East');

  const result = classifyForEdition(understood, 'ar-global');
  check('a real Gaza/Syria/Iran-style item now classifies into World (العالم) via the residual-geography path, not unclassified',
    result.field === 'العالم' || result.field_code === 'world',
    `got field=${result.field}, field_code=${result.field_code}, status=${result.classification_status}`);
}

// --- 2. Each of the 4 newly-added tokens resolves individually. ---
{
  const cases = [
    { token: 'أمريكا', expect: 'Americas' },
    { token: 'آسيا', expect: 'Southeast Asia' },
    { token: 'أوروبا', expect: 'Europe' },
    { token: 'الشرق الأوسط', expect: 'Middle East' },
  ];
  for (const { token, expect } of cases) {
    const understood = understandStory({
      title: 'خبر عام', description: '', link: 'https://example.com/ar/general',
      categories: [token], sourceName: 'test',
    });
    check(`RSS category "${token}" resolves to geography="${expect}"`,
      understood.geography_candidates.some(g => g.value === expect),
      `got: ${JSON.stringify(understood.geography_candidates)}`);
  }
}

// --- 3. Mutation-style check: an UNRECOGNISED Arabic token must still
// yield zero geography candidates -- proves the fix is additive, not a
// blanket "any Arabic text passes" bypass. ---
{
  const understood = understandStory({
    title: 'خبر عام', description: '', link: 'https://example.com/ar/general',
    categories: ['كلمة غير معروفة'], // "unknown word", deliberately not in the vocabulary
    sourceName: 'test',
  });
  check('an unrecognised Arabic category still yields zero geography candidates (fix is additive, not a bypass)',
    understood.geography_candidates.length === 0);
}

// --- 4. decodeURIComponent() fix: a percent-encoded Arabic URL desk
// segment now decodes correctly before vocabulary lookup. Uses a
// synthetic desk token that IS in SUBJECT_VOCABULARY (سياسة -> Politics)
// so the test proves the decode step itself, independent of whether this
// exact geography token also has a URL-path entry. ---
{
  const decodedDesk = 'سياسة';
  const encodedUrl = `https://example.com/ar/${encodeURIComponent(decodedDesk)}/some-article`;
  const understood = understandStory({
    title: 'عنوان الخبر', description: '', link: encodedUrl, categories: [], sourceName: 'test',
  });
  check('a percent-encoded Arabic URL desk segment (سياسة, URL-encoded) now resolves via Tier 2 (url_path) after decoding',
    understood.subject_candidates.some(s =>
      s.value === 'Politics' && s.evidence.some(e => e.evidence_type === 'url_segment' && e.value === 'سياسة')),
    `got: ${JSON.stringify(understood.subject_candidates)}`);
}

// --- 5. Regression: an already-working ASCII URL desk segment (English,
// never percent-encoded) is completely unaffected by the decode step --
// decodeURIComponent() on plain ASCII is a no-op, but prove it explicitly
// rather than assuming. ---
{
  const understood = understandStory({
    title: 'Some headline', description: '',
    link: 'https://www.theguardian.com/world/politics/2026/08/some-article',
    categories: [], sourceName: 'test',
  });
  check('an ASCII (English) URL desk segment still resolves correctly after the decode change (no regression)',
    understood.subject_candidates.some(s =>
      s.value === 'Politics' && s.evidence.some(e => e.evidence_type === 'url_segment' && e.value === 'politics')),
    `got: ${JSON.stringify(understood.subject_candidates)}`);
}

// --- 6. Regression: malformed percent-encoding in a URL segment must
// fail open (fall back to the raw segment) rather than throwing and
// losing the whole item's classification evidence. ---
{
  const understood = understandStory({
    title: 'Some headline', description: '',
    link: 'https://example.com/en/politics%/some-article', // "%" with no following hex digits -- invalid encoding
    categories: [], sourceName: 'test',
  });
  check('a malformed percent-encoded URL segment does not throw and does not lose the item (fails open)',
    Array.isArray(understood.subject_candidates));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
