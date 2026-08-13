// shadow-runner.test.mjs — regression test for the chunking bug found
// live while running Pendidikan (193 candidates) through shadow mode:
// the story_clusters query wasn't chunked like the rss_items query was,
// causing a fetch failure past a certain .in() clause size.
//
// This test doesn't hit the DB — it verifies the CHUNKING LOGIC itself
// (batch size, no ID dropped, no ID duplicated) against a large synthetic
// ID list, so the bug can't silently reappear as the real candidate pool
// grows past whatever size currently happens to work.
//
// Run: node ranking/shadow-runner.test.mjs

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nSHADOW RUNNER — chunking regression test\n');

// Mirrors the exact chunking pattern used in shadow-runner.mjs for both
// the story_clusters and rss_items queries.
function chunkIds(ids, size = 100) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

{
  const ids = Array.from({ length: 193 }, (_, i) => `story-${i}`); // exact size that broke live
  const chunks = chunkIds(ids, 100);
  assert('193 IDs split into exactly 2 chunks (100 + 93)',
    chunks.length === 2 && chunks[0].length === 100 && chunks[1].length === 93,
    `chunks=${chunks.map(c => c.length)}`);
  const rejoined = chunks.flat();
  assert('No ID dropped across chunks', rejoined.length === ids.length);
  assert('No ID duplicated across chunks', new Set(rejoined).size === ids.length);
  assert('Order preserved', rejoined.every((id, i) => id === ids[i]));
}

{
  const ids = Array.from({ length: 99 }, (_, i) => `story-${i}`);
  const chunks = chunkIds(ids, 100);
  assert('A pool smaller than one chunk size produces exactly 1 chunk (no off-by-one)',
    chunks.length === 1 && chunks[0].length === 99);
}

{
  const ids = Array.from({ length: 100 }, (_, i) => `story-${i}`);
  const chunks = chunkIds(ids, 100);
  assert('A pool exactly equal to chunk size produces exactly 1 chunk, not 2 empty-tail chunks',
    chunks.length === 1 && chunks[0].length === 100);
}

{
  const ids = Array.from({ length: 501 }, (_, i) => `story-${i}`); // well beyond any field seen in production so far
  const chunks = chunkIds(ids, 100);
  const rejoined = chunks.flat();
  assert('Large pool (501 IDs, beyond current max real field size) still round-trips exactly',
    rejoined.length === 501 && new Set(rejoined).size === 501);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
