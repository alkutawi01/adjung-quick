import { PIN_EXPIRING_WINDOW_HOURS, LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS } from './editorialAttentionConfig.js';
import { evaluateEditorialAttention, fetchEditorialAttention } from './editorialAttentionAdapter.js';

let passed = 0;
let failed = 0;
const assert = (label, condition) => {
  if (condition) { console.log(`  PASS — ${label}`); passed += 1; }
  else { console.log(`  FAIL — ${label}`); failed += 1; }
};

const now = new Date('2026-08-16T06:00:00.000Z');
const hoursFromNow = hours => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
const hoursAgo = hours => hoursFromNow(-hours);
const pin = (overrides = {}) => ({
  story_id: 'story-pin', override_type: 'pin', active: true,
  expires_at: hoursFromNow(1), ...overrides,
});
// classifications now carry publishedAt — fetchEditorialAttention resolves
// this from rss_items itself; evaluateEditorialAttention takes it directly.
const lowConf = (overrides = {}) => ({
  story_id: 'low', classification_confidence: 0.49, publishedAt: hoursAgo(1), ...overrides,
});

console.log('\nEDITORIAL ATTENTION — V2 evaluation tests\n');

assert('configuration locks the pin-expiring window at six hours', PIN_EXPIRING_WINDOW_HOURS === 6);
assert('configuration locks the low-confidence freshness window at 48 hours', LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS === 48);
assert('no input signals returns no attention items', evaluateEditorialAttention({}, now).length === 0);

{
  const items = evaluateEditorialAttention({ classifications: [lowConf()] }, now);
  assert('confidence below 0.5 AND fresh (<48h) creates action_required',
    items.length === 1 && items[0].type === 'low_confidence' && items[0].category === 'action_required');
}
{
  const items = evaluateEditorialAttention({
    classifications: [lowConf({ story_id: 'at-threshold', classification_confidence: 0.5 })],
  }, now);
  assert('confidence exactly 0.5 is not low confidence', items.length === 0);
}
{
  const items = evaluateEditorialAttention({
    classifications: [lowConf({ publishedAt: hoursAgo(LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS) })],
  }, now);
  assert('low confidence exactly at the 48h freshness boundary is included',
    items.length === 1 && items[0].type === 'low_confidence');
}
{
  const items = evaluateEditorialAttention({
    classifications: [lowConf({ publishedAt: hoursAgo(LOW_CONFIDENCE_FRESHNESS_WINDOW_HOURS + 0.001) })],
  }, now);
  assert('low confidence just past the 48h freshness boundary is excluded (this is the real production finding: 17/19 stale items must not qualify)',
    items.length === 0);
}
{
  const items = evaluateEditorialAttention({
    classifications: [lowConf({ publishedAt: hoursAgo(4771) })], // ~199 days, a real production item
  }, now);
  assert('a real-world stale low-confidence item (~199 days old) is excluded, not just a synthetic boundary case',
    items.length === 0);
}
{
  const items = evaluateEditorialAttention({
    classifications: [lowConf({ publishedAt: null })],
  }, now);
  assert('a low-confidence item with no resolvable publish date is excluded (fail closed, never guess freshness)',
    items.length === 0);
}

{
  const items = evaluateEditorialAttention({ snapshot: { failed_sources_count: 2 } }, now);
  assert('aggregate failed-source count creates informational signal',
    items.length === 1 && items[0].type === 'source_failure' && items[0].category === 'informational');
  assert('failed-source signal does not fabricate a source name',
    !('sourceName' in items[0]) && !/RTM|Bernama|Sinar/i.test(items[0].what));
}

{
  const items = evaluateEditorialAttention({
    classifications: [lowConf()],
    snapshot: { failed_sources_count: 1 },
    pins: [pin()],
  }, now);
  const expectedCategories = {
    low_confidence: 'action_required',
    source_failure: 'informational',
    pin_expiring: 'informational',
  };
  assert('every AttentionItem has the stable output contract without a rank or score',
    items.every(item => (
      typeof item.type === 'string' &&
      item.category === expectedCategories[item.type] &&
      item.presentation?.status === item.category &&
      typeof item.reason === 'string' &&
      !('score' in item) && !('rank' in item)
    )));
}
assert('zero failed-source aggregate creates no signal',
  evaluateEditorialAttention({ snapshot: { failed_sources_count: 0 } }, now).length === 0);

assert('pin expiring at exactly six hours is included',
  evaluateEditorialAttention({ pins: [pin({ expires_at: hoursFromNow(6) })] }, now).some(i => i.type === 'pin_expiring'));
assert('pin expiring after six hours is excluded',
  evaluateEditorialAttention({ pins: [pin({ expires_at: hoursFromNow(6.001) })] }, now).length === 0);
assert('pin expiring within six hours is included',
  evaluateEditorialAttention({ pins: [pin({ expires_at: hoursFromNow(5.999) })] }, now).some(i => i.type === 'pin_expiring'));
assert('expired pin is excluded',
  evaluateEditorialAttention({ pins: [pin({ expires_at: hoursFromNow(-0.001) })] }, now).length === 0);
assert('pin expiring exactly now is excluded as expired',
  evaluateEditorialAttention({ pins: [pin({ expires_at: now.toISOString() })] }, now).length === 0);
assert('inactive pin is excluded',
  evaluateEditorialAttention({ pins: [pin({ active: false })] }, now).length === 0);

function createSupabaseMock() {
  const calls = [];
  const resultByTable = {
    edition_story_classifications: { data: [{ story_id: 'low', classification_confidence: 0.49 }], error: null },
    operational_snapshots_public: { data: [{ snapshot_date: '2026-08-16', failed_sources_count: 1 }], error: null },
    story_overrides: { data: [pin()], error: null },
    rss_items: { data: [{ cluster_id: 'low', published_at: hoursAgo(1) }], error: null },
  };
  const makeQuery = table => {
    const query = {
      select() { return query; },
      eq(column, value) { calls.push([table, 'eq', column, value]); return query; },
      or(value) { calls.push([table, 'or', value]); return query; },
      gt(column, value) { calls.push([table, 'gt', column, value]); return query; },
      lte(column, value) { calls.push([table, 'lte', column, value]); return Promise.resolve(resultByTable[table]); },
      in(column, value) { calls.push([table, 'in', column, value]); return Promise.resolve(resultByTable[table]); },
      then(resolve, reject) { return Promise.resolve(resultByTable[table]).then(resolve, reject); },
    };
    return query;
  };
  return { supabase: { from: table => makeQuery(table) }, calls };
}

{
  const { supabase, calls } = createSupabaseMock();
  const items = await fetchEditorialAttention(supabase, 'ms-MY', now);
  assert('fetch integration evaluates all three signal sources', items.length === 3);
  assert('fetch integration uses the existing confidence cutoff of 0.5',
    calls.some(([table, method, value]) => table === 'edition_story_classifications' && method === 'or' && value === 'classification_confidence.lt.0.5'));
  assert('fetch integration limits pins to active, unexpired six-hour window',
    calls.some(([table, method, column]) => table === 'story_overrides' && method === 'eq' && column === 'active') &&
    calls.some(([table, method, column]) => table === 'story_overrides' && method === 'gt' && column === 'expires_at') &&
    calls.some(([table, method, column]) => table === 'story_overrides' && method === 'lte' && column === 'expires_at'));
  assert('fetch integration resolves publish time from rss_items for the freshness gate',
    calls.some(([table, method, column]) => table === 'rss_items' && method === 'in' && column === 'cluster_id'));
}

{
  // A low-confidence story whose publish time resolves to >48h old must not
  // reach the caller as action_required, even through the full fetch path
  // (not just the pure evaluator) — this is the exact production bug V2 fixes.
  const { supabase } = createSupabaseMock();
  supabase.from = table => {
    if (table === 'rss_items') {
      return { select: () => ({ in: () => Promise.resolve({ data: [{ cluster_id: 'low', published_at: hoursAgo(4771) }], error: null }) }) };
    }
    const resultByTable = {
      edition_story_classifications: { data: [{ story_id: 'low', classification_confidence: 0.49 }], error: null },
      operational_snapshots_public: { data: [], error: null },
      story_overrides: { data: [], error: null },
    };
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; },
      gt() { return query; }, lte() { return Promise.resolve(resultByTable[table]); },
      then(resolve, reject) { return Promise.resolve(resultByTable[table]).then(resolve, reject); },
    };
    return query;
  };
  const items = await fetchEditorialAttention(supabase, 'ms-MY', now);
  assert('fetch integration excludes a stale (~199 day old) low-confidence story end-to-end',
    items.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
