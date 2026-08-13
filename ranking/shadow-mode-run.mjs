// shadow-mode-run.mjs — runs Shadow Mode against real production data for
// a deliberately mixed set of fields (per ChatGPT: not every field — the
// point is seeing different CHARACTERS, not exhaustive coverage).
//
// PROTOTYPE — isolated. No UI wiring, no persistence of any result.
//
// Usage: node ranking/shadow-mode-run.mjs

import { runShadow } from './shadow-runner.mjs';
import { compareSelections } from './ranking-comparator.mjs';
import { printShadowReport } from './shadow-report.mjs';

const FIELDS = [
  ['ms-MY', 'Politik'],   // many sources, real diversity/composition activity expected
  ['ms-MY', 'Agama'],     // moderate sources, healthy natural spread (per small-field benchmark)
  ['ms-MY', 'Pendidikan'],// single-source field, editorial expected to equal legacy
  ['ms-MY', 'Sains'],     // smallest field, single-source
  ['ms-MY', 'Teknologi'], // specialised single-newsroom source (Amanz)
];

async function main() {
  console.log('\nSHADOW MODE — legacy vs editorial, real production data, no persistence\n');

  for (const [edition, field] of FIELDS) {
    try {
      const shadow = await runShadow(edition, field);
      if (shadow.candidateCount === 0) {
        console.log(`\n=== ${field} (${edition}) — 0 candidates, skipping ===\n`);
        continue;
      }
      const comparison = compareSelections(shadow.legacy, shadow.editorial);
      printShadowReport(shadow, comparison);
    } catch (err) {
      console.error(`${field} (${edition}) failed:`, err.message);
    }
  }

  console.log('Done. No output persisted, no production path affected.\n');
}

main().catch(err => {
  console.error('shadow-mode-run failed:', err.message);
  process.exit(1);
});
