// explainability-report.mjs — Editorial Ranking Engine explainability
// output, per ChatGPT's explicit request: "bila Izzat tanya 'kenapa
// berita ini masuk, tetapi berita itu tidak?' kita ada jawapan."
//
// PROTOTYPE — isolated, not wired into production. Formats the pipeline's
// existing per-candidate `reasons`/`compositionReasons` data into one
// human-auditable report — no new logic, no new scoring, purely a
// presentation layer over what candidate-scoring.mjs and
// editorial-composition.mjs already compute and attach.

export function buildExplainabilityReport({ edition, field, selected, compositionReasons = {} }) {
  return {
    edition,
    field,
    selected: selected.map(s => ({
      storyId: s.storyId,
      title: s.title,
      source: s.sourceId,
      score: Math.round((s.finalScore ?? s.score) * 10) / 10,
      selectedBy: [
        ...(s.reasons ?? []),
        ...(compositionReasons[s.storyId] ?? []),
      ],
    })),
  };
}

export function printExplainabilityReport(report) {
  console.log(`\n=== Explainability Report — ${report.edition} / ${report.field} ===\n`);
  report.selected.forEach((s, i) => {
    console.log(`${i + 1}. ${s.title.slice(0, 60)} (${s.source})`);
    console.log(`   score: ${s.score}  selectedBy: [${s.selectedBy.join(', ')}]`);
  });
  console.log('');
}
