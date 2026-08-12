// test-edition-classification.mjs — Sesi 3B test, per
// docs/edition-classification-contract.md. Runs the full pipeline
// (Story Understanding -> Edition Classification for all 3 editions)
// against the real live corpus.
//
// Run: node classification/test-edition-classification.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { understandStory } from './story-understanding.mjs';
import { classifyForAllEditions } from './edition-classification.mjs';

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const items = results.filter(r => r.ok).flatMap(r =>
  r.items.map(i => ({ ...i, sourceName: r.source.name })));

console.log(`\nEDITION CLASSIFICATION — Sesi 3B test, ${items.length} real items\n`);

const byEditionField = { 'ms-MY': {}, en: {}, ar: {} };
const unclassifiedCount = { 'ms-MY': 0, en: 0, ar: 0 };
let editionsDiffer = 0;
const differExamples = [];

for (const item of items) {
  const understanding = understandStory(item);
  const editions = classifyForAllEditions(understanding);

  for (const ed of ['ms-MY', 'en-global', 'ar-global']) {
    const r = editions[ed];
    if (r.classification_status === 'unclassified') unclassifiedCount[ed]++;
    else byEditionField[ed][r.field] = (byEditionField[ed][r.field] ?? 0) + 1;
  }

  // Does the resolved field's underlying universal subject differ across editions?
  const subjects = new Set(
    ['ms-MY', 'en-global', 'ar-global']
      .map(ed => editions[ed].classification_rule)
      .filter(Boolean)
      .map(rule => rule.split(' -> ')[0])
  );
  if (subjects.size > 1) {
    editionsDiffer++;
    if (differExamples.length < 8) differExamples.push({ item, editions });
  }
}

for (const ed of ['ms-MY', 'en-global', 'ar-global']) {
  console.log(`\n=== ${ed} ===`);
  console.log(`  Unclassified: ${unclassifiedCount[ed]}/${items.length}`);
  for (const [field, count] of Object.entries(byEditionField[ed]).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(16)} ${count}`);
  }
}

console.log(`\nEDITIONS DISAGREEING ON UNDERLYING SUBJECT: ${editionsDiffer}/${items.length}`);
for (const { item, editions } of differExamples) {
  console.log(`\n  "${item.title.slice(0, 65)}"`);
  for (const ed of ['ms-MY', 'en-global', 'ar-global']) {
    console.log(`    ${ed.padEnd(6)} -> ${editions[ed].field}  (${editions[ed].classification_method}, ${editions[ed].confidence})`);
  }
}

console.log('\nSAMPLE FULL OUTPUT (3 items)');
for (const item of items.slice(0, 3)) {
  const understanding = understandStory(item);
  const editions = classifyForAllEditions(understanding);
  console.log(`\n  "${item.title.slice(0, 65)}"`);
  console.log('  ' + JSON.stringify(editions, null, 1).replace(/\n/g, '\n  '));
}
console.log('');
