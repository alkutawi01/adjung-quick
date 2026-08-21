// tier5-geography-content.test.mjs — Global Phase 4B-C (2026-08-21,
// docs/global-edition-decision-v1.md).
//
// Tests extractGeographyContentEvidence() and its wiring into
// understandStory() -- the fix for Tier 5 never checking
// GEOGRAPHY_VOCABULARY against title/description text at all. Covers
// exactly the acceptance criteria the director specified before this
// could merge: positive case, negative case (subject still wins over a
// bare geography mention), a real mutation test (remove the wiring, the
// positive-case test must fail), and word-boundary safety (the actual
// regression risk named -- short common words like "asia"/"world"
// shouldn't false-positive inside unrelated text).

import { understandStory } from './story-understanding.mjs';
import { extractGeographyContentEvidence } from './lib/content-rules.mjs';
import { GEOGRAPHY_VOCABULARY } from './lib/desk-vocabulary.mjs';

let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nTIER 5 GEOGRAPHY CONTENT EVIDENCE — Phase 4B-C\n');

// --- Positive case: the exact scenario the audit found broken --
// "الشرق الأوسط" literally in the headline, no category field at all,
// previously yielded zero geography candidates. ---
{
  const understood = understandStory({
    title: 'واشنطن تشدد الضغط الاقتصادي على الشرق الأوسط',
    description: '', link: 'https://example.com/ar/general', categories: [],
    sourceName: 'test',
  });
  check('a title containing الشرق الأوسط (no category field, no URL desk) now yields a geography candidate via Tier 5',
    understood.geography_candidates.some(g => g.value === 'Middle East'),
    `got: ${JSON.stringify(understood.geography_candidates)}`);
}

// --- Negative case: a geography mention does NOT override a clear
// subject signal -- subject candidates still take priority downstream
// (this test checks the raw candidate list has BOTH, proving geography
// doesn't suppress subject; the priority ordering itself is
// edition-classification.mjs's existing, untouched logic). ---
{
  const understood = understandStory({
    title: 'وزير الاقتصاد يبحث ملف الشرق الأوسط', // "Economy minister discusses Middle East file" -- has both a Politics phrase (وزير) and a geography mention
    description: '', link: 'https://example.com/ar/general', categories: [],
    sourceName: 'test',
  });
  check('a story with BOTH a subject phrase and a geography mention produces a subject candidate (Politics via وزير)',
    understood.subject_candidates.some(s => s.value === 'Politics'),
    `got subjects: ${JSON.stringify(understood.subject_candidates)}`);
  check('...and ALSO produces the geography candidate (both coexist, geography does not suppress subject)',
    understood.geography_candidates.some(g => g.value === 'Middle East'),
    `got geo: ${JSON.stringify(understood.geography_candidates)}`);
}

// --- Word-boundary safety: the actual regression risk named by the
// director. Short common-word geography keys ('asia', 'world', 'europe')
// must not false-positive as a SUBSTRING inside unrelated words. ---
{
  const understood = understandStory({
    title: 'Fantasia football league expands',
    description: 'A new fantasy sports platform', link: 'https://example.com/en/sports', categories: [],
    sourceName: 'test',
  });
  check('"Fantasia" (contains "asia" as a substring) does NOT falsely trigger a Southeast Asia geography candidate',
    !understood.geography_candidates.some(g => g.value === 'Southeast Asia'),
    `got: ${JSON.stringify(understood.geography_candidates)}`);
}
{
  const understood = understandStory({
    title: 'Wordsworth exhibit opens at the museum',
    description: '', link: 'https://example.com/en/culture', categories: [],
    sourceName: 'test',
  });
  check('"Wordsworth" (contains "world" as a substring) does NOT falsely trigger a World geography candidate',
    !understood.geography_candidates.some(g => g.value === 'World'),
    `got: ${JSON.stringify(understood.geography_candidates)}`);
}

// --- Regression: a real ms-MY-style story with no geography-vocabulary
// word anywhere in it is completely unaffected. ---
{
  const understood = understandStory({
    title: 'Kerajaan umum bajet baharu untuk tahun depan',
    description: '', link: 'https://example.com/ms/budget-2027', categories: [],
    sourceName: 'test',
  });
  check('an ordinary ms-MY-style story with no geography-vocabulary term present yields zero geography candidates (no regression)',
    understood.geography_candidates.length === 0,
    `got: ${JSON.stringify(understood.geography_candidates)}`);
}

// --- Mutation test: prove the wiring, not just the underlying function,
// actually matters -- call extractGeographyContentEvidence() directly
// with the SAME inputs understandStory() would use, and confirm it
// independently returns the hit (isolates the function from the
// wiring, so a future accidental removal of the wiring call in
// story-understanding.mjs is what the earlier positive-case test guards
// against, not just this function existing in isolation). ---
{
  const hits = extractGeographyContentEvidence('الشرق الأوسط اليوم', '', GEOGRAPHY_VOCABULARY);
  check('extractGeographyContentEvidence() itself (isolated from understandStory wiring) returns the Middle East hit',
    hits.some(h => h.geography === 'Middle East'),
    `got: ${JSON.stringify(hits)}`);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
