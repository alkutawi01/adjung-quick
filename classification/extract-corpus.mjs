// extract-corpus.mjs — Dumps every desk/category signal the 9 real RSS
// sources actually emit, so the Bidang mapping matrix is built from evidence
// instead of assumption (ChatGPT's Sesi 1 instruction, 2026-08-12).
//
// This is an AUDIT tool, not part of the classifier. It answers exactly one
// question: "what raw desk/category vocabulary do our sources produce?"
// Deciding what those values MEAN as a Quick Bidang is a separate step that
// needs Izzat's sign-off.
//
// Run: node classification/extract-corpus.mjs [--json]

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';

// Extract the newsroom "desk" from a story URL. Publishers encode the desk as
// the leading path segments (utusan.com.my/nasional/politik/2026/08/slug), so
// we keep leading segments and stop at the first date/id/slug-looking one.
export function deskFromUrl(link) {
  try {
    const segs = [];
    for (const s of new URL(link).pathname.split('/').filter(Boolean)) {
      if (/^\d+$/.test(s)) break;          // year / month / numeric id
      if (s.length > 40) break;            // slug
      if (s.split('-').length > 4) break;  // slug
      segs.push(s);
    }
    return segs.slice(0, 2).join('/') || null;
  } catch {
    return null;
  }
}

function tally(map, key) {
  if (key == null || key === '') return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const corpus = [];
let totalItems = 0;

for (const r of results) {
  const src = r.source ?? {};
  if (!r.ok) {
    corpus.push({ source: src.name ?? '?', id: src.id, ok: false, items: 0 });
    continue;
  }
  const desks = new Map();
  const cats = new Map();      // every category value, any position
  const firstCats = new Map(); // <category>[0] only — the Tier-2 signal
  let noDesk = 0;

  for (const item of r.items) {
    const d = deskFromUrl(item.link);
    if (d) tally(desks, d); else noDesk++;
    const c = item.categories ?? [];
    c.forEach(v => tally(cats, v));
    if (c.length) tally(firstCats, c[0]);
  }

  totalItems += r.items.length;
  corpus.push({
    source: src.name,
    id: src.id,
    language: src.language,
    ok: true,
    items: r.items.length,
    itemsWithoutUrlDesk: noDesk,
    itemsWithCategory: r.items.filter(i => i.categories?.length).length,
    urlDesks: sortedEntries(desks),
    firstCategories: sortedEntries(firstCats),
    allCategories: sortedEntries(cats),
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ totalItems, corpus }, null, 2));
} else {
  console.log(`\nDESK/CATEGORY CORPUS — ${totalItems} real RSS items across ${corpus.length} sources\n`);
  for (const s of corpus) {
    if (!s.ok) { console.log(`\n### ${s.source} — FETCH FAILED\n`); continue; }
    console.log(`\n### ${s.source} (${s.language}) — ${s.items} items`);
    console.log(`    URL desk missing: ${s.itemsWithoutUrlDesk}/${s.items}   <category> present: ${s.itemsWithCategory}/${s.items}`);
    console.log(`    URL DESKS      : ${s.urlDesks.map(([k, n]) => `${k}(${n})`).join(', ') || '— none'}`);
    console.log(`    CATEGORY[0]    : ${s.firstCategories.map(([k, n]) => `${k}(${n})`).join(', ') || '— none'}`);
    const others = s.allCategories.filter(([k]) => !s.firstCategories.some(([f]) => f === k));
    if (others.length) {
      console.log(`    OTHER CATEGORY : ${others.slice(0, 15).map(([k, n]) => `${k}(${n})`).join(', ')}${others.length > 15 ? ` … +${others.length - 15} more` : ''}`);
    }
  }
  console.log('');
}
