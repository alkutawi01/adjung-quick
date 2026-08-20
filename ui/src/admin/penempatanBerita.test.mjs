// penempatanBerita.test.mjs — Polish 8E (docs/polish-8e-placement-audit-v1.md).
//
// Renders the real "Penempatan Berita" page components (esbuild +
// react-dom/server, the same approach unpinWiring.test.mjs uses) and
// asserts the two things the 8E-A audit found broken:
//
//   K2 — the next rule's priority was `activeRules.length + 1`, which
//        reuses a live number the moment any rule is archived. On a
//        top-priority tie the resolver DISCARDS both rules and falls back
//        to the built-in default, so an admin rule silently loses to the
//        very default it was written to override.
//   UI — the page spoke the engine's language: raw English classifier
//        values, the word "seksyen", stacked headings, and one product
//        question ("from where?") split across two technical dropdowns.
//
// Copy checks are scoped to THIS page on purpose. The director rejected a
// global copyLint ban on "seksyen": the word may be legitimate elsewhere,
// and a project-wide prohibition driven by one page is the wrong tool.
//
// Run: node ui/src/admin/penempatanBerita.test.mjs

import fs from 'fs';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { console.log(`  PASS — ${label}`); passed++; }
  else { console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\nPENEMPATAN BERITA — placement rules page (Polish 8E)\n');

const managerUrl = new URL('./EditionRulesManager.jsx', import.meta.url);
const managerSrc = fs.readFileSync(managerUrl, 'utf8');
const adapterSrc = fs.readFileSync(new URL('./editionRulesAdapter.js', import.meta.url), 'utf8');

const tmpUrl = new URL('./.penempatanBerita.compiled.tmp.mjs', import.meta.url);
let EditionRulesManager, AddEditionRuleForm, nextPriorityFor, buildRulePayload, subjectLabel, locationLabel;
try {
  await build({
    entryPoints: [fileURLToPath(managerUrl)],
    outfile: fileURLToPath(tmpUrl),
    bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    external: ['react', 'react-dom', 'react-dom/server', '@supabase/supabase-js'],
  });
  ({ default: EditionRulesManager, AddEditionRuleForm, nextPriorityFor, buildRulePayload, subjectLabel, locationLabel } = await import(tmpUrl.href));
} finally {
  fs.rmSync(tmpUrl, { force: true });
}

const TAXONOMY_CODES = ['politics', 'dunia', 'nasional', 'crime'];
const TAXONOMY_LABELS = ['Politik', 'Dunia', 'Nasional', 'Jenayah'];

const rule = over => ({
  id: 'r1', condition_subject: 'Politics', condition_geography_type: 'not',
  condition_geography_value: 'Malaysia', action_field_code: 'dunia',
  priority: 1, status: 'active', reason: null, ...over,
});

const renderPage = rules => renderToStaticMarkup(
  React.createElement(EditionRulesManager, {
    taxonomyFieldCodes: TAXONOMY_CODES, taxonomyFieldLabels: TAXONOMY_LABELS,
    rules, busy: false, onAdd() {}, onArchive() {}, onRestore() {},
  }),
);

// --- K2: the priority collision, exactly the director's scenario.
// These call the REAL exported nextPriorityFor(). An earlier version of
// this test re-implemented the formula inline and asserted on its own copy,
// which stayed 35/35 green when the component was reverted to the buggy
// `activeRules.length + 1` — caught by adversarial review. ---
{
  // priorities 1,2,3 -> archive #2 -> a new rule must get 4, NOT 3.
  const rules = [
    rule({ id: 'a', priority: 1, status: 'active' }),
    rule({ id: 'b', priority: 2, status: 'archived' }),
    rule({ id: 'c', priority: 3, status: 'active' }),
  ];
  assert('priorities 1,2,3 with #2 archived -> next priority is 4, not 3 (no collision with the live #3)',
    nextPriorityFor(rules) === 4);
  assert('archived rules still count — the old formula ignored them and reused a live number',
    nextPriorityFor(rules) > Math.max(...rules.filter(r => r.status === 'active').map(r => r.priority)));
  assert('empty list yields 1', nextPriorityFor([]) === 1);
  assert('nullish rules yield 1 rather than NaN', nextPriorityFor(undefined) === 1 && nextPriorityFor(null) === 1);
  assert('a rule with priority 0 or null does not produce a duplicate 0',
    nextPriorityFor([{ priority: 0 }]) === 1 && nextPriorityFor([{ priority: null }]) === 1);
  assert('negative priorities never lower the next value below 1',
    nextPriorityFor([{ priority: -5 }]) === 1);
  // The number the FORM actually receives must be that function's output,
  // not a second implementation living in the component.
  const parentTree = EditionRulesManager({
    taxonomyFieldCodes: TAXONOMY_CODES, taxonomyFieldLabels: TAXONOMY_LABELS,
    rules, busy: false, onAdd() {}, onArchive() {}, onRestore() {},
  });
  const findForm = node => {
    if (!node || typeof node !== 'object') return null;
    if (node.type === AddEditionRuleForm) return node;
    const kids = node.props?.children;
    for (const k of Array.isArray(kids) ? kids.flat(Infinity) : [kids]) {
      const hit = findForm(k);
      if (hit) return hit;
    }
    return null;
  };
  const form = findForm(parentTree);
  assert('the manager passes nextPriorityFor(rules) straight through to the form',
    form?.props?.nextPriority === 4);
}

// --- The payload the form sends. Covers the geography XOR, which the DB
// enforces (edition_rules_geography_xor: type and value BOTH null or BOTH
// set) and which nothing tested before — breaking it left the suite green. ---
{
  const all = buildRulePayload({ subject: 'Politics', locationKey: 'all', fieldCode: 'dunia', nextPriority: 7 });
  assert('"Semua lokasi" sends BOTH geography fields null (XOR satisfied)',
    all.conditionGeographyType === null && all.conditionGeographyValue === null);

  const my = buildRulePayload({ subject: 'Crime', locationKey: 'malaysia', fieldCode: 'nasional', nextPriority: 2 });
  assert('"Malaysia" sends is/Malaysia (XOR satisfied, both set)',
    my.conditionGeographyType === 'is' && my.conditionGeographyValue === 'Malaysia');

  const luar = buildRulePayload({ subject: 'Politics', locationKey: 'luar', fieldCode: 'dunia', nextPriority: 3 });
  assert('"Luar Malaysia" sends not/Malaysia (XOR satisfied, both set)',
    luar.conditionGeographyType === 'not' && luar.conditionGeographyValue === 'Malaysia');

  for (const [name, p] of [['all', all], ['malaysia', my], ['luar', luar]]) {
    const bothNull = p.conditionGeographyType === null && p.conditionGeographyValue === null;
    const bothSet = p.conditionGeographyType !== null && p.conditionGeographyValue !== null;
    assert(`location "${name}" can never send one null and one set`, bothNull || bothSet);
  }

  assert('the payload stores the ENGLISH machine subject, not the Malay label',
    my.conditionSubject === 'Crime');
  assert('the payload carries the computed priority through unchanged',
    all.priority === 7);
  assert('an unknown location key falls back to "Semua lokasi" rather than a split pair',
    (() => { const p = buildRulePayload({ subject: 'X', locationKey: 'nope', fieldCode: 'y', nextPriority: 1 });
      return p.conditionGeographyType === null && p.conditionGeographyValue === null; })());
}

// --- Legacy rows: values this page no longer offers must still render in
// Malay, never as raw English (the exact defect 8E-A found). ---
{
  assert('a legacy Business subject renders as Bisnes', subjectLabel('Business') === 'Bisnes');
  assert('a legacy Europe geography renders in Malay', locationLabel('is', 'Europe') === 'Dari Eropah');
  assert('a legacy not/Southeast Asia renders in Malay', locationLabel('not', 'Southeast Asia') === 'Bukan dari Asia Tenggara');
  assert('a wholly unknown subject still shows what the rule matches on', subjectLabel('Zzz') === 'Zzz');
  const legacyHtml = renderPage([rule({ condition_subject: 'Business', condition_geography_type: 'is', condition_geography_value: 'Europe' })]);
  const legacyBody = legacyHtml.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
  assert('a legacy rule ROW leaks no raw English geography/subject',
    !/>Business</.test(legacyBody) && !/Europe/.test(legacyBody) && /Bisnes/.test(legacyBody) && /Eropah/.test(legacyBody));
  assert('a legacy rule is still archivable (no capability lost)', /Arkibkan/.test(legacyHtml));
}

// --- K1: the page must admit rules are not live until the next run. ---
{
  const html = renderPage([]);
  assert('page states the change applies at the NEXT classification, not immediately',
    /pengelasan seterusnya/.test(html) && /tidak mengubah paparan pembaca serta-merta/.test(html));
  assert('no "apply now" button was invented (director: confirm the scheduler first)',
    !/Terapkan sekarang/i.test(html));
}

// --- UI shape: the editor's language, not the engine's. ---
{
  const html = renderPage([rule()]);
  assert('description matches the locked sentence',
    /Tentukan jika berita daripada sesuatu kategori perlu dipaparkan dalam kategori lain\./.test(html));
  for (const col of ['Berita', 'Lokasi', 'Paparkan dalam']) {
    assert(`table has a "${col}" column`, new RegExp(`<th>${col}</th>`).test(html));
  }
  assert('form asks "Berita kategori"', /Berita kategori/.test(html));
  assert('form asks "Jika lokasinya"', /Jika lokasinya/.test(html));
  // Scoped to the TABLE BODY: "Politics" legitimately appears elsewhere on
  // the page as an <option value>, since the resolver matches that exact
  // English string. What must never appear is the raw value as displayed
  // TEXT in a rule row.
  const tbody = html.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0] ?? '';
  assert('a stored rule renders in Malay, not raw classifier values',
    /<td[^>]*>Politik<\/td>/.test(tbody) && /<td[^>]*>Luar Malaysia<\/td>/.test(tbody)
    && !/>Politics</.test(tbody));
  assert('no priority column is exposed to the editor', !/<th>Keutamaan<\/th>/.test(html));
}

// --- Location is ONE product dropdown, not two technical ones. ---
{
  const html = renderToStaticMarkup(React.createElement(AddEditionRuleForm, {
    taxonomyFieldCodes: TAXONOMY_CODES, taxonomyFieldLabels: TAXONOMY_LABELS,
    busy: false, onAdd() {}, nextPriority: 1,
  }));
  assert('exactly 3 dropdowns: kategori, lokasi, paparkan dalam',
    (html.match(/<select/g) ?? []).length === 3);
  for (const opt of ['Semua lokasi', 'Malaysia', 'Luar Malaysia']) {
    assert(`location dropdown offers "${opt}"`, new RegExp(`>${opt}<`).test(html));
  }
  for (const leaked of ['Americas', 'Europe', 'Southeast Asia', 'Middle East']) {
    assert(`geography "${leaked}" is NOT exposed in ms-MY V1`, !new RegExp(leaked).test(html));
  }
  // Scoped to the FIRST <select> ("Berita kategori"). Nasional and Dunia are
  // perfectly valid in the THIRD select ("Paparkan dalam") — they are
  // legitimate placement TARGETS, just not valid rule SUBJECTS.
  const subjectSelect = html.match(/<select[\s\S]*?<\/select>/)?.[0] ?? '';
  assert('category dropdown shows Malay labels',
    />Jenayah</.test(subjectSelect) && />Bencana</.test(subjectSelect));
  assert('subject dropdown does NOT offer Nasional/Dunia (geography residuals) or Bisnes (two subjects)',
    !/>Nasional</.test(subjectSelect) && !/>Dunia</.test(subjectSelect) && !/>Bisnes</.test(subjectSelect));
  assert('but "Paparkan dalam" DOES still offer Dunia as a target',
    />Dunia</.test(html));
  // Machine values must survive in the option values — the resolver compares
  // condition_subject as an exact English string.
  assert('option VALUES stay English machine values (the resolver matches on them)',
    /value="Politics"/.test(html) && /value="Disaster"/.test(html));
}

// --- A rule pointing at an archived taxonomy field must say so. ---
{
  const html = renderPage([rule({ action_field_code: 'kategori-yang-dah-diarkibkan' })]);
  // The code appears ONLY inside the explanatory parenthetical, never as a
  // bare label. Without it two broken rules are indistinguishable and the
  // editor cannot tell which category a rule was pointing at.
  assert('archived target renders a human sentence, not a bare field code',
    /Kategori sasaran tidak tersedia \(kategori-yang-dah-diarkibkan\)/.test(html));
  assert('the raw code never appears on its own outside that sentence',
    (html.match(/kategori-yang-dah-diarkibkan/g) ?? []).length === 1);
}

// --- Archived rules get their own table with a restore action. ---
{
  const html = renderPage([rule({ id: 'z', status: 'archived', reason: 'tidak relevan' })]);
  assert('archived section renders', /Diarkibkan/.test(html));
  assert('archived rule offers "Aktifkan semula"', /Aktifkan semula/.test(html));
}

// --- Page-scoped copy rules (NOT a global copyLint ban). ---
{
  const html = renderPage([rule(), rule({ id: 'z2', status: 'archived', reason: 'x' })]);
  for (const banned of ['seksyen', 'bidang', 'awak', 'opsyenal']) {
    assert(`rendered page never says "${banned}"`, !new RegExp(banned, 'i').test(html));
  }
}

// --- Adapter errors reach the editor without an internal function name. ---
{
  assert('editionRulesAdapter.js no longer prefixes thrown messages with the function name',
    !/throw new Error\(`(fetch|add|archive|restore)EditionRule/.test(adapterSrc));
  assert('adapter errors are readable Malay sentences',
    /Gagal memuatkan penempatan berita/.test(adapterSrc));
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
