# Backend Control Plane — Phase 2: Browser Consumer Mini-Design v1 (2026-08-17)

Status: `[x] Mini-design` `[ ] Approved` — no code written. Answers
ChatGPT's question before any cutover: how does `state/editions.js`'s
taxonomy come from `taxonomy_fields` without a sync-vs-async mismatch
in the browser, and without new infrastructure.

## 1. Current behaviour, precisely

`state/editions.js` computes `EDITIONS` **synchronously, at ES module
import time**:
```js
import { TAXONOMY_REGISTRY } from '../classification/lib/taxonomy-registry.mjs';
export const EDITIONS = Object.fromEntries(
  Object.entries(EDITION_META).map(([editionId, meta]) => {
    const wheelEntries = TAXONOMY_REGISTRY[editionId].filter(e => e.wheel_visible);
    return [editionId, { editionId, ...meta,
      taxonomy: wheelEntries.map(e => e.label),
      taxonomyFieldCodes: wheelEntries.map(e => e.field_code) }];
  }),
);
```
This runs the instant the browser evaluates the module — before React
mounts, before any component exists, before any network request could
possibly resolve. `App.jsx`, `AdminApp.jsx`, `state/reducer.js` and
others import `EDITIONS`/`getEdition()`/`getFieldLabel()` and expect a
**fully-populated, synchronous value** the moment they run.

**This is a fundamentally different shape than `classify-production.js`'s
problem** (§1 of the implementation plan): that file is a short-lived
CLI process where "load once before the loop starts" is a single
`await` at the top of `main()`. A browser module has no equivalent
"top of main()" moment — module evaluation cannot be paused for a
network round-trip.

## 2. What the reader ALREADY does for exactly this class of problem

Per direct read of `ui/src/adapter/productionAdapter.js` and
`ui/src/App.jsx`: **the reader already has a working, existing pattern
for backend data that can't be known at module-load time.**
`fetchRankedQueue()` is an async function, called from inside a
`useEffect` in `App.jsx` (confirmed directly — `App.jsx:47-57`), and
the app renders a loading state until that resolves. `sources`,
`story_clusters`, `rss_items`, `edition_story_classifications`,
overrides, filter rules — **none of these are module-load-time
constants**; all of them are fetched async, after mount, exactly
because they're backend data.

**Taxonomy is the only piece of "backend data" in this entire
architecture still pretending to be a build-time constant.** That's
the actual gap — not a missing capability, an inconsistency with a
pattern this codebase already uses correctly everywhere else.

## 3. Three approaches, compared

**Option A — Fetch taxonomy at application bootstrap, same mechanism as `fetchRankedQueue()`**
```
App mounts
  → useEffect: fetchTaxonomyFields() (new function, productionAdapter.js)
  → while pending: existing loading UI (already exists for the ranked
    queue fetch — no new loading-state pattern needed)
  → on resolve: dispatch an action that populates taxonomy into state
    (or a lightweight module-level cache, see §4)
  → components read taxonomy the same way they read EDITIONS today
```
Reuses the EXACT mechanism `fetchRankedQueue()` already established.
No new infrastructure — one new adapter function, one new fetch call
alongside the ones that already run on mount.

**Option B — Taxonomy Context/Provider**
```
<TaxonomyProvider> wraps <App>, fetches on mount, exposes via
React Context, every consumer calls useTaxonomy() instead of
importing EDITIONS directly.
```
Technically sound, but this is a **new state-management primitive**
(a Context provider, a new hook, a new consumption pattern) for data
that `App.jsx` already fetches and threads through as plain props/state
for everything else (ranked queue, sources, overrides). Introducing
Context for taxonomy alone, while every sibling backend fetch uses the
existing `useState`/`useEffect` + prop-threading pattern, would be a
new pattern living next to an old one for no functional reason —
exactly the "generic data layer" ChatGPT explicitly said not to build.

**Option C — Server/build-time injection**
No existing mechanism in this codebase does build-time data injection
(confirmed — this is a Vite SPA with runtime Supabase fetches
throughout, no SSR/SSG step that could inject data at build time).
Per ChatGPT's own instruction ("jangan cipta infrastructure baru
semata-mata untuk ini"), building a build-time injection pipeline from
scratch — for one table — is disqualified outright.

## 4. Chosen approach: A, using the simplest possible shape

**A, with taxonomy held as a module-level mutable cache in
`state/editions.js` itself** — not Redux/Context, not a new store.
Mirrors exactly what `classification/lib/taxonomy-registry.mjs`'s
Phase 2 cutover already did (a `let`-bound export, reassigned once by
an explicit loader call) — same pattern, just triggered by a `useEffect`
instead of a CLI script's `main()`.

```js
// state/editions.js — illustrative shape, not written yet
export let EDITIONS = buildEditionsFromRegistry(FALLBACK_TAXONOMY_REGISTRY); // sync initial value

export async function loadEditionsFromDB(supabase) {
  const { data, error } = await supabase.from('taxonomy_fields')
    .select('edition_id, field_code, label, wheel_visible, display_order')
    .eq('status', 'active').order('display_order');
  if (error) throw new Error(`loadEditionsFromDB: ${error.message}`);
  if (data.length === 0) throw new Error('loadEditionsFromDB: 0 active rows — refusing empty taxonomy');
  EDITIONS = buildEditionsFromRegistry(groupByEdition(data));
  return EDITIONS;
}
```

`App.jsx` gains one more `useEffect`-driven call
(`loadEditionsFromDB(supabase)`) alongside its existing
`fetchRankedQueue()` call, awaited before the app renders its real
content — same loading-state pattern already in place.

## 5. Not rendering with empty/stale taxonomy silently

Per ChatGPT's explicit requirement:
- `loadEditionsFromDB()` **throws** if the query returns 0 active rows
  (shown above) — never silently falls through to an empty Wheel.
- Until the fetch resolves, the app shows its **existing** loading
  state (the same one already gating on `fetchRankedQueue()`) — the
  synchronous `FALLBACK_TAXONOMY_REGISTRY`-derived `EDITIONS` value
  exists as the pre-fetch placeholder purely so `EDITIONS` is never
  `undefined` if something reads it before the fetch resolves, NOT as
  a silent production fallback (see §7).
- If the fetch fails (network error, RLS misconfiguration, etc.), the
  error propagates the same way `fetchRankedQueue()`'s own failures
  already do — surfaced, not swallowed.

## 6. Public reader vs Admin — same source, no divergence

Both `App.jsx` (public reader) and `AdminApp.jsx` (admin) already
import from `state/editions.js`'s single `EDITIONS`/`getEdition()`
exports — no separate taxonomy path exists for Admin today, and this
design doesn't create one. One `loadEditionsFromDB()` call (likely in
whichever component mounts first / a shared root-level effect) serves
both.

## 7. `wheel_visible`, `label`, `status`, `display_order` — exact mapping

- `status = 'archived'` rows are **excluded entirely** by the query's
  own `.eq('status', 'active')` filter — an archived Kategori never
  reaches the browser at all, not even as a hidden entry.
- `wheel_visible = false` rows ARE fetched (status active) but excluded
  from `taxonomy`/`taxonomyFieldCodes` the same way
  `state/editions.js` already filters `TAXONOMY_REGISTRY[editionId]`
  today (`.filter(e => e.wheel_visible)`) — behavior unchanged, only
  the data source changes.
- `display_order` — the query's `.order('display_order')` preserves
  the exact curated Wheel ordering, same as the DB-side backfill
  already guaranteed for the classifier's own cutover.
- `label` — read directly, this is literally what makes rename work
  without a redeploy.

## 8. What happens if the DB is unreachable

The app fails the same way it already fails if `fetchRankedQueue()`
can't reach Supabase — no ranked queue, no reader content, an error
state (exact UI treatment is unchanged, not redesigned by this plan).
Per ChatGPT's explicit instruction, `TAXONOMY_REGISTRY`'s hardcoded
literal is **never** silently used as a production fallback if the DB
call fails — that would make it a second, undocumented source of
truth exactly contradicting the whole point of Phase 2. It only exists
pre-fetch as a type-safe placeholder (§5) and as the historical
backfill reference, never as a runtime fallback path.

## 9. Parity test plan (once implemented)

Same technique as the classifier's own cutover: capture
`EDITIONS`/`taxonomy`/`taxonomyFieldCodes` computed from the CURRENT
hardcoded `TAXONOMY_REGISTRY` (already known, unchanged), then after
cutover, capture the same shape computed from `taxonomy_fields`, and
diff — 0 mismatches required across all 3 editions before this is
considered safe.

## What this document does NOT do

- No code written
- Does not decide exactly where `loadEditionsFromDB()` is called from
  (that's implementation detail, decided when this is approved)
- Does not touch `AdminApp.jsx`'s own logic beyond confirming it
  already shares `state/editions.js`'s single source
- Does not redesign any loading/error UI — reuses what
  `fetchRankedQueue()` already established

## Next

Awaiting ChatGPT's choice of approach (A is proposed, B/C explicitly
argued against) before an implementation plan or code is written.
