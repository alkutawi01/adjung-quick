// content-rules.test.mjs — regression test for the HTML-stripping fix
// (2026-08-13, the Trump/Hormuz -> Health false positive). Per
// ChatGPT's explicit concern: confirm stripHtml removes markup
// (img/a/div tags and their attributes) without eating real article
// text that happens to be wrapped in tags like <p>.
//
// Run: node classification/content-rules.test.mjs

import { extractContentEvidence } from './lib/content-rules.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nCONTENT RULES — HTML stripping regression test\n');

// The exact real-world shape that caused the bug: an unrelated <img alt>
// caption containing a keyword must NOT produce a false hit.
{
  const hits = extractContentEvidence(
    'Konflik Asia Barat: Trump dakwa AS akan terus kekalkan penguasaan Selat Hormuz',
    '<img alt="an event to sign an executive order regarding vaccine flexibility" src="x.jpg"> Presiden AS mendakwa kawalan penuh ke atas Selat Hormuz.'
  );
  assert('img alt="...vaccine..." does not produce a Health hit', !hits.some(h => h.subject === 'Health'), JSON.stringify(hits));
}

// Real article text wrapped in ordinary tags must still be matched —
// stripping markup must not eat the content itself.
{
  const hits = extractContentEvidence('Kejadian di Sabah', '<p>Gempa bumi melanda kawasan pedalaman Sabah semalam.</p>');
  assert('real content inside <p> tags still matches (gempa bumi -> Disaster)', hits.some(h => h.subject === 'Disaster'), JSON.stringify(hits));
}

// Markup-only noise (links, divs) around real text should be stripped,
// not concatenated into false substrings.
{
  const hits = extractContentEvidence('Berita Sukan', '<div class="wrap"><a href="/tag/vaksin">Tag</a>Perlawanan bola sepak berlangsung meriah.</div>');
  assert('real content survives div/a wrapping (bola sepak -> Sports)', hits.some(h => h.subject === 'Sports'), JSON.stringify(hits));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
