// shadow-report.mjs — human-readable print of a shadow-mode comparison.
// Per ChatGPT's exact example format. Output only, no persistence.

export function printShadowReport(shadow, comparison) {
  console.log(`\n=== SHADOW REPORT — ${shadow.field} (${shadow.edition}) — ${shadow.candidateCount} candidates ===\n`);

  console.log('Legacy source distribution:', JSON.stringify(comparison.sourceDistribution.legacy));
  console.log('Editorial source distribution:', JSON.stringify(comparison.sourceDistribution.editorial));
  console.log(`Stability (unchanged/legacy): ${Math.round(comparison.stability * 100)}%`);

  if (comparison.diff.added.length > 0) {
    console.log('\nChanges (+ added by editorial, not in legacy):');
    comparison.diff.added.forEach(c => {
      console.log(`  + ${c.title.slice(0, 55)} (${c.source})`);
      console.log(`    reasons: ${c.reasons.join(', ')}`);
    });
  }
  if (comparison.diff.removed.length > 0) {
    console.log('\nRemoved (in legacy, not in editorial):');
    comparison.diff.removed.forEach(c => {
      console.log(`  - ${c.title.slice(0, 55)} (${c.source})`);
    });
  }
  if (comparison.diff.added.length === 0 && comparison.diff.removed.length === 0) {
    console.log('\nNo difference — both paths selected the identical set.');
  }
  console.log('');
}
