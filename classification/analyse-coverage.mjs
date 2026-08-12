// analyse-coverage.mjs — Answers the question the mapping matrix depends on:
// of the desk/category signals our 9 real sources emit, how many actually
// carry SUBJECT meaning (which is what a Bidang is), versus how many are
// geographic or merely structural (recency/format buckets)?
//
// This matters because Adjung's 24 Bidang are a SUBJECT taxonomy (Ekonomi,
// Sains, Sejarah, Syariah, Falsafah…) while newsrooms organise desks largely
// by GEOGRAPHY and SECTION (world, us-news, nasional, mutakhir). If most of
// our desk signal is geographic, then "use the desk the RSS gives us" cannot
// by itself populate Bidang — and Izzat needs to know that before choosing
// the final Bidang list.
//
// Run: node classification/analyse-coverage.mjs

import { RSS_SOURCES } from '../lab/sources.js';
import { fetchFeed } from '../lab/rss.js';
import { deskFromUrl } from './extract-corpus.mjs';

// Classification of the RAW desk vocabulary observed on 2026-08-12.
// SUBJECT   — carries topical meaning, can map to a Bidang
// GEOGRAPHIC— tells us where, not what
// STRUCTURAL— recency/format/section-of-site, no editorial meaning at all
const DESK_KIND = {
  // --- subject-bearing ---
  'ekonomi': 'SUBJECT', 'economy': 'SUBJECT', 'ebusiness': 'SUBJECT', 'business': 'SUBJECT',
  'gaya/hiburan': 'SUBJECT', 'arts': 'SUBJECT', 'food': 'SUBJECT', 'travel': 'SUBJECT',
  'sport': 'SUBJECT', 'sports': 'SUBJECT', 'football': 'SUBJECT',
  'science': 'SUBJECT', 'tech': 'SUBJECT', 'environment': 'SUBJECT',
  'politics': 'SUBJECT', 'nasional/politik': 'SUBJECT', 'berita-politik': 'SUBJECT',
  'opinions': 'SUBJECT',
  // --- geographic ---
  'world': 'GEOGRAPHIC', 'world/live': 'GEOGRAPHIC', 'us-news': 'GEOGRAPHIC',
  'us-news/live': 'GEOGRAPHIC', 'uk-news': 'GEOGRAPHIC', 'australia-news': 'GEOGRAPHIC',
  'australia-news/live': 'GEOGRAPHIC', 'nasional': 'GEOGRAPHIC',
  'berita-malaysia': 'GEOGRAPHIC', 'berita-dunia': 'GEOGRAPHIC',
  // --- structural / meaningless for Bidang ---
  'mutakhir': 'STRUCTURAL', 'terkini': 'STRUCTURAL', 'berita': 'STRUCTURAL',
  'news': 'STRUCTURAL', 'news/articles': 'STRUCTURAL', 'news/videos': 'STRUCTURAL',
  'news/liveblog': 'STRUCTURAL', 'video/newsfeed': 'STRUCTURAL',
  'features/longform': 'STRUCTURAL', 'arabic/articles': 'STRUCTURAL',
};

// Same judgement for the Tier-2 <category>[0] vocabulary.
const CAT_KIND = {
  'Negara': 'GEOGRAPHIC', 'NASIONAL': 'GEOGRAPHIC', 'Asia Barat': 'GEOGRAPHIC',
  'BERITA': 'STRUCTURAL', 'News': 'STRUCTURAL', 'Newsfeed': 'STRUCTURAL',
  'Show Types': 'STRUCTURAL', 'TV News': 'STRUCTURAL', 'أخبار': 'STRUCTURAL',
  'EKONOMI': 'SUBJECT', 'hiburan': 'SUBJECT', 'Sport': 'SUBJECT',
  'سياسة': 'SUBJECT', 'رياضة': 'SUBJECT', 'اقتصاد': 'SUBJECT',
  'فن': 'SUBJECT', 'تكنولوجيا': 'SUBJECT', 'علوم': 'SUBJECT',
};

function kindOfDesk(d) { return d == null ? 'NONE' : (DESK_KIND[d] ?? 'UNMAPPED'); }
function kindOfCat(c) { return c == null ? 'NONE' : (CAT_KIND[c] ?? 'UNMAPPED'); }

// Best available signal for one item, walking ChatGPT's trust tiers.
function bestSignal(item) {
  const dk = kindOfDesk(deskFromUrl(item.link));
  if (dk === 'SUBJECT') return 'SUBJECT (tier1 url desk)';
  const ck = kindOfCat(item.categories?.[0]);
  if (ck === 'SUBJECT') return 'SUBJECT (tier2 category)';
  if (dk === 'GEOGRAPHIC' || ck === 'GEOGRAPHIC') return 'GEOGRAPHIC only';
  if (dk === 'UNMAPPED' || ck === 'UNMAPPED') return 'UNMAPPED value';
  return 'NO SIGNAL (structural/none)';
}

const results = await Promise.all(RSS_SOURCES.map(fetchFeed));
const overall = new Map();
let total = 0;

console.log('\nSIGNAL QUALITY PER SOURCE — can the source tell us the SUBJECT?\n');
for (const r of results) {
  if (!r.ok) continue;
  const per = new Map();
  for (const item of r.items) {
    const s = bestSignal(item);
    per.set(s, (per.get(s) ?? 0) + 1);
    overall.set(s, (overall.get(s) ?? 0) + 1);
    total++;
  }
  const subj = [...per].filter(([k]) => k.startsWith('SUBJECT')).reduce((n, [, v]) => n + v, 0);
  console.log(`${r.source.name.padEnd(22)} ${String(subj).padStart(3)}/${String(r.items.length).padEnd(3)} subject-bearing   ${[...per].map(([k, v]) => `${k}:${v}`).join('  ')}`);
}

console.log(`\nOVERALL across ${total} real items:`);
for (const [k, v] of [...overall].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  (${String(Math.round(v / total * 100)).padStart(2)}%)  ${k}`);
}
const subjectTotal = [...overall].filter(([k]) => k.startsWith('SUBJECT')).reduce((n, [, v]) => n + v, 0);
console.log(`\n=> Only ${subjectTotal}/${total} (${Math.round(subjectTotal / total * 100)}%) of items carry a usable SUBJECT signal from RSS metadata alone.`);
console.log(`   The rest need Tier-4 content rules, or stay Unclassified.\n`);
