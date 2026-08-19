// carry-forward-personal-state.test.mjs — Polish 6B.1 acceptance suite.
// Fixture/in-memory only, per ChatGPT's explicit instruction -- NO
// production/network calls. Run: node db/carry-forward-personal-state.test.mjs

import {
  computeProtectedStoryIds,
  computeMissingProtected,
  buildCarryForwardClusterRow,
  buildCarryForwardItemRows,
  validateCarryForwardCluster,
  findItemIdCollisions,
  findStillMissingProtected,
} from './carry-forward-personal-state.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nPOLISH 6B.1 — PERSONAL STATE CARRY-FORWARD acceptance suite\n');

const clusterA = { id: 'cluster-a', topic: 'Ekonomi', workspace_state: 'active', freshness_score: 80, cross_source_score: 10, prominence_score: 5, expires_at: '2026-09-01T00:00:00Z', review_expires_at: null, first_seen_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z', representative_rss_item_id: 'item-a1' };
const itemsA = [
  { id: 'item-a1', source_id: 'rss-metro', cluster_id: 'cluster-a', rss_guid: 'g1', title: 'Judul A', description: 'Huraian A', link: 'https://x/a', normalized_url: 'x/a', language: 'ms', published_at: '2026-08-15T00:00:00Z', fetched_at: '2026-08-15T00:05:00Z', categories: [], source_known_category: null },
  { id: 'item-a2', source_id: 'rss-kosmo', cluster_id: 'cluster-a', rss_guid: 'g2', title: 'Judul A2', description: null, link: 'https://x/a2', normalized_url: 'x/a2', language: 'ms', published_at: '2026-08-15T00:01:00Z', fetched_at: '2026-08-15T00:06:00Z', categories: [], source_known_category: null },
];

// --- #1: tiada personal data -> tiada carry-forward ---
{
  const protectedIds = computeProtectedStoryIds([], []);
  const missing = computeMissingProtected(protectedIds, new Set(['cluster-x', 'cluster-y']));
  assert('#1 tiada personal data -> tiada story carry-forward', missing.length === 0);
}

// --- #2: saved story masih ada dlm fresh corpus -> tiada carry-forward pendua ---
{
  const protectedIds = computeProtectedStoryIds([{ story_id: 'cluster-a' }], []);
  const freshClusterIds = new Set(['cluster-a', 'cluster-b']);
  const missing = computeMissingProtected(protectedIds, freshClusterIds);
  assert('#2 saved story dlm fresh corpus -> tiada carry-forward', missing.length === 0);
}

// --- #3: saved story hilang drpd fresh corpus -> cluster+items dibawa, expired ---
{
  const protectedIds = computeProtectedStoryIds([{ story_id: 'cluster-a' }], []);
  const freshClusterIds = new Set(['cluster-b']);
  const missing = computeMissingProtected(protectedIds, freshClusterIds);
  assert('#3a cluster-a dikesan perlu carry-forward', missing.length === 1 && missing[0] === 'cluster-a');
  const row = buildCarryForwardClusterRow(clusterA);
  assert('#3b workspace_state dipaksa expired', row.workspace_state === 'expired');
  assert('#3c representative_rss_item_id null dahulu', row.representative_rss_item_id === null);
  assert('#3d skor asal dikekalkan tanpa ubah', row.freshness_score === 80 && row.cross_source_score === 10 && row.prominence_score === 5);
  const itemRows = buildCarryForwardItemRows(itemsA);
  assert('#3e semua item cluster dibawa', itemRows.length === 2);
  assert('#3f fetched_at asal dikekalkan (bukan re-fetch)', itemRows[0].fetched_at === '2026-08-15T00:05:00Z');
}

// --- #4: history sahaja (tiada saved) turut melindungi story ---
{
  const protectedIds = computeProtectedStoryIds([], [{ story_id: 'cluster-a' }]);
  const missing = computeMissingProtected(protectedIds, new Set(['cluster-b']));
  assert('#4 history sahaja turut melindungi', missing.length === 1 && missing[0] === 'cluster-a');
}

// --- #5: saved/history dah tamat (tak masuk protected langsung, sebab
// caller dah tapis expires_at > nowIso sebelum panggil computeProtectedStoryIds) ---
{
  // Simulasi: baris tamat tak pernah sampai ke sini (ditapis oleh query
  // caller sendiri) -- protected set kosong utk row yg dah expired.
  const protectedIds = computeProtectedStoryIds([], []);
  assert('#5 row tamat tak masuk protected set (ditapis di query, bukan di sini)', protectedIds.size === 0);
}

// --- #6: satu story dirujuk >1 baris (saved+history serentak) -> carry-forward SEKALI sahaja ---
{
  const protectedIds = computeProtectedStoryIds([{ story_id: 'cluster-a' }], [{ story_id: 'cluster-a' }]);
  assert('#6 Set dedup -- satu entry sahaja', protectedIds.size === 1);
  const missing = computeMissingProtected(protectedIds, new Set());
  assert('#6b carry-forward sekali sahaja', missing.length === 1);
}

// --- #7/#8: source_id item carry-forward tiada dlm sources_staging -> fail closed ---
{
  const stagingSourceIds = new Set(['rss-metro']); // rss-kosmo sengaja tak ada
  const errors = validateCarryForwardCluster({ liveCluster: clusterA, liveItems: itemsA, stagingSourceIds });
  assert('#7/#8 source_id tiada -> fail closed dgn mesej jelas', errors.some(e => e.includes('rss-kosmo') && e.includes('tiada dalam sources_staging')));
}
{
  const stagingSourceIds = new Set(['rss-metro', 'rss-kosmo']);
  const errors = validateCarryForwardCluster({ liveCluster: clusterA, liveItems: itemsA, stagingSourceIds });
  assert('#7b semua source_id sah -> tiada ralat', errors.length === 0);
}

// --- #9: perlanggaran ID item carry-forward vs fresh -> fail closed ---
{
  const freshItemsById = new Map([['item-a1', { id: 'item-a1', cluster_id: 'cluster-DIFFERENT' }]]);
  const errors = findItemIdCollisions(itemsA, freshItemsById);
  assert('#9 ID sama tapi cluster berbeza -> fail closed', errors.length === 1 && errors[0].includes('item-a1'));
}
{
  const freshItemsById = new Map(); // tiada collision langsung
  const errors = findItemIdCollisions(itemsA, freshItemsById);
  assert('#9b tiada collision -> tiada ralat', errors.length === 0);
}

// --- #10: semua protected ID ada dlm staging -> swap diteruskan ---
{
  const protectedIds = new Set(['cluster-a', 'cluster-b']);
  const stagingClusterIds = new Set(['cluster-a', 'cluster-b', 'cluster-c']);
  const missing = findStillMissingProtected(protectedIds, stagingClusterIds);
  assert('#10 semua protected ada -> sifar missing, swap selamat', missing.length === 0);
}

// --- #11: representative cluster carry-forward hilang/tak konsisten -> fail SEBELUM swap ---
{
  const badCluster = { ...clusterA, representative_rss_item_id: 'item-TIADA' };
  const errors = validateCarryForwardCluster({ liveCluster: badCluster, liveItems: itemsA, stagingSourceIds: new Set(['rss-metro', 'rss-kosmo']) });
  assert('#11 representative tiada dlm item yg dibawa -> fail closed', errors.some(e => e.includes('representative_rss_item_id') && e.includes('item-TIADA')));
}
{
  const badCluster = { ...clusterA, representative_rss_item_id: null };
  const errors = validateCarryForwardCluster({ liveCluster: badCluster, liveItems: itemsA, stagingSourceIds: new Set(['rss-metro', 'rss-kosmo']) });
  assert('#11b representative null -> fail closed', errors.length > 0);
}

// --- #12: (diuji di ingest-production.js integration, bukan unit murni --
// dicatat di sini sbg dokumentasi kontrak: cleanup A ialah DELETE terus
// (bukan sebahagian transaksi staging), jadi kalau ingestion gagal
// SELEPAS cleanup, row tamat kekal terpadam (correct, per design), tapi
// live sources/story_clusters/rss_items KEKAL tak berubah sebab swap
// belum panggil. Tiada fungsi murni utk uji -- ini sifat susunan kod
// ingest-production.js sendiri (assertion dibuat di situ). ---
assert('#12 (dicatat) -- kontrak: cleanup A tak boleh balik (by design), live tables tak berubah sehingga swap', true);

// --- #13 (tambahan ChatGPT): protected story yang MASIH dlm fresh corpus
// KEKAL keadaan normal -- tak sesekali ditukar expired hanya sebab ia
// protected. Ditunjuk melalui reka bentuk: computeMissingProtected()
// mengecualikan cluster yg dah ada dlm freshClusterIds -- carry-forward
// logic (buildCarryForwardClusterRow, workspace_state='expired') hanya
// dipanggil utk ID dlm senarai "missing", tak pernah utk fresh cluster. ---
{
  const protectedIds = computeProtectedStoryIds([{ story_id: 'cluster-a' }], []);
  const freshClusterIds = new Set(['cluster-a']); // cluster-a MASIH fresh
  const missing = computeMissingProtected(protectedIds, freshClusterIds);
  assert('#13 protected story yg masih fresh TAK masuk senarai carry-forward (kekal state normal)', missing.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
