// rtm-url-vocabulary.test.mjs — Polish 9C (docs/polish-9-audit-v1.md).
//
// RTM serves the same categories under TWO different URL structures:
//   A) "/{category}/senarai-berita-{category}/..." (leading bare category)
//   B) "/senarai-berita-{category}/senarai-artikel/..." (no leading segment)
// Structure A was already 100% classified in real production data across
// every RTM category checked; Structure B was the only source of RTM's
// classification gaps, because deskFromUrl() takes each path segment as a
// WHOLE token (no hyphen-splitting), so "senarai-berita-sukan" never
// matched the shorter 'sukan'/'berita-sukan' keys already registered.
//
// Every URL below is a REAL production URL (or the same shape as one)
// pulled from a live SQL query against edition_story_classifications
// during this audit, not invented -- proving the fix against the actual
// failure mode found, not a synthetic approximation of it.
//
// Run: node classification/rtm-url-vocabulary.test.mjs

import { understandStory } from './story-understanding.mjs';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nRTM ALTERNATE URL STRUCTURE — vocabulary regression (Polish 9C)\n');

function topSubject(understanding) {
  return understanding.subject_candidates[0]?.value ?? null;
}
function topGeography(understanding) {
  return understanding.geography_candidates[0]?.value ?? null;
}

// --- Structure A (leading bare category) already worked before this fix
// and MUST keep working unchanged -- this fix must be additive, not a
// regression on the path that was already reliable. ---
{
  const item = {
    sourceId: 'rss-rtm-sukan',
    title: 'Contoh berita sukan',
    description: null,
    link: 'https://berita.rtm.gov.my/sukan/senarai-berita-sukan/senarai-artikel/kuartet-4x400m-pulau-pinang-tamat-kemarau-emas-28-tahun/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure A (sukan/senarai-berita-sukan/...) still resolves to Sports — unaffected by this fix',
    topSubject(u) === 'Sports');
}

// --- Structure B: the real gap this fix closes. Each URL below is the
// real shape found live in production for an unclassified item. ---
{
  const item = {
    sourceId: 'rss-rtm-sukan',
    title: 'Rasional kenaikan gaji penjawat awam, tiada semakan lebih 10 tahun',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-nasional/senarai-artikel/rasional-kenaikan-gaji-penjawat-awam/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-nasional (real unclassified URL, non-sports content under the "sukan" feed) now resolves geography to Malaysia',
    topGeography(u) === 'Malaysia');
}
{
  const item = {
    sourceId: 'rss-rtm-sukan',
    title: 'Pengundian PRN Sabah terkawal, tiada insiden tidak diingini',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-pilihan-raya/senarai-artikel/pengundian-prn-sabah-terkawal-tiada-insiden-tidak-diingini/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-pilihan-raya (real unclassified URL) now resolves subject to Politics',
    topSubject(u) === 'Politics');
}
{
  const item = {
    sourceId: 'rss-rtm-sukan',
    title: 'TFC rombak pasukan, kontrak Gabriel Silva tidak disambung',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-sukan/senarai-artikel/tfc-rombak-pasukan-kontrak-gabriel-silva-tidak-disambung/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-sukan (genuinely sports content, real unclassified URL) now resolves subject to Sports',
    topSubject(u) === 'Sports');
}
{
  const item = {
    sourceId: 'rss-rtm-hiburan',
    title: 'Contoh berita hiburan',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-hiburan/senarai-artikel/contoh-artikel-hiburan/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-hiburan (same URL family, different category, applied uniformly) resolves subject to Entertainment',
    topSubject(u) === 'Entertainment');
}
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita jenayah',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-jenayah/senarai-artikel/contoh-artikel-jenayah/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-jenayah resolves subject to Crime',
    topSubject(u) === 'Crime');
}
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita ekonomi',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-ekonomi/senarai-artikel/contoh-artikel-ekonomi/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-ekonomi resolves subject to Economy',
    topSubject(u) === 'Economy');
}
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita dunia',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-dunia/senarai-artikel/contoh-artikel-dunia/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-dunia resolves geography to World (already worked via title luck in production; now works via URL directly too)',
    topGeography(u) === 'World');
}

// --- Adversarial review (2026-08-20) caught that 3 of the 10 new keys
// (niaga, kes, global) had no test of their own — a wrong VALUE for any
// of them (not just a missing key) would have shipped silently. Closing
// that gap: same pattern as every case above, one per remaining key. ---
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita niaga',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-niaga/senarai-artikel/contoh-artikel-niaga/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-niaga resolves subject to Business',
    topSubject(u) === 'Business');
}
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita kes',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-kes/senarai-artikel/contoh-artikel-kes/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-kes resolves subject to Crime (mirrors the existing bare "kes" -> Crime precedent, 2026-08-16)',
    topSubject(u) === 'Crime');
}
{
  const item = {
    sourceId: 'rss-rtm-nasional',
    title: 'Contoh berita global',
    description: null,
    link: 'https://berita.rtm.gov.my/senarai-berita-global/senarai-artikel/contoh-artikel-global/',
    categories: [],
  };
  const u = understandStory(item);
  assert('Structure B senarai-berita-global resolves geography to World',
    topGeography(u) === 'World');
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
