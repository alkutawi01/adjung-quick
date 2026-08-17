# Backend Control Plane — Phase 2: Browser Consumer Cutover, Implementation Plan v1 (2026-08-17)

Status: `[x] Plan` `[ ] Approved` — **revised 2026-08-17 per ChatGPT's
review: closed a real first-render stale-taxonomy gap (§2a — sequencing
the `await`s alone doesn't stop React from rendering with the fallback
on the very first paint; `isLoading` must gate the whole reader render,
reusing the existing early-return pattern, not a new component),
`display_order` now explicitly selected (§1), and `taxonomyError` now
gates `AdminApp.jsx`'s render alongside `taxonomyReady`.** No code
written.

Follow-up to `docs/control-plane-phase2-taxonomy-browser-consumer-design-v1.md`
(mini-design, **APPROVED** by ChatGPT 2026-08-17, Approach A —
`useEffect`-driven `loadEditionsFromDB()`, sequencing fix for the
React re-render gap, locked bootstrap order, independent `AdminApp.jsx`
call). This plan covers exactly how to implement it — code next, only
after this is approved.

## 1. `state/editions.js` changes

```js
// Illustrative — not written yet
import { TAXONOMY_REGISTRY as FALLBACK_TAXONOMY_REGISTRY } from '../classification/lib/taxonomy-registry.mjs';

function buildEditionsFromRegistry(registry) {
  return Object.fromEntries(
    Object.entries(EDITION_META).map(([editionId, meta]) => {
      const wheelEntries = (registry[editionId] ?? []).filter(e => e.wheel_visible);
      return [editionId, { editionId, ...meta,
        taxonomy: wheelEntries.map(e => e.label),
        taxonomyFieldCodes: wheelEntries.map(e => e.field_code) }];
    }),
  );
}

// Sync initial value — never undefined, but ONLY a pre-fetch
// placeholder (per design §8), never a silent production fallback.
export let EDITIONS = buildEditionsFromRegistry(FALLBACK_TAXONOMY_REGISTRY);

export async function loadEditionsFromDB(supabase) {
  const { data, error } = await supabase
    .from('taxonomy_fields')
    // display_order explicitly selected (per ChatGPT's correction) —
    // it's part of the data this query is actually about (building the
    // Wheel's order), not just an ORDER BY clause detail to discard.
    // .order() below already sorts the returned rows correctly even
    // without selecting the column, but selecting it keeps the fetched
    // shape self-describing and makes the ordering verifiable/debuggable
    // from the result itself, not just trusted implicitly.
    .select('edition_id, field_code, label, wheel_visible, display_order')
    .eq('status', 'active')
    .order('display_order');
  if (error) throw new Error(`loadEditionsFromDB: ${error.message}`);
  if (data.length === 0) {
    throw new Error('loadEditionsFromDB: taxonomy_fields returned 0 active rows — refusing to load an empty taxonomy.');
  }
  // Grouping below preserves the DB's own .order('display_order')
  // sequence — Array.prototype.push() within a single forward pass
  // over an already-sorted `data` array never reorders entries, so
  // each edition's group stays in display_order sequence without a
  // second explicit sort.
  const grouped = {};
  for (const row of data) {
    if (!grouped[row.edition_id]) grouped[row.edition_id] = [];
    grouped[row.edition_id].push({ field_code: row.field_code, label: row.label, wheel_visible: row.wheel_visible });
  }
  EDITIONS = buildEditionsFromRegistry(grouped);
  return EDITIONS;
}
```

`getFieldLabel()`, `getEdition()`, `EDITION_IDS`, `DEFAULT_EDITION_ID`
— **all unchanged**, since they already read `EDITIONS`/module-level
state, and `EDITIONS` being reassigned is transparent to them (they
never cache a snapshot of their own).

## 2. `App.jsx` bootstrap effect — exact diff

Current (`App.jsx:47-108`, simplified):
```js
useEffect(() => {
  (async () => {
    const [queue, names] = await Promise.all([fetchRankedQueue(...), fetchSourceNames()]);
    setRankedQueue(queue);
    const firstTopic = getEdition(...).taxonomyFieldCodes[0];
    setState(s => reduce(s, selectTopic(firstTopic), {...}));
  })();
}, [state.editionContext.activeEdition]);
```

Revised (per design §4b — taxonomy gate added, everything else unchanged):
```js
useEffect(() => {
  let cancelled = false;
  setIsLoading(true);
  (async () => {
    try {
      // NEW — must resolve before anything below reads getEdition()/EDITIONS.
      await loadEditionsFromDB(supabase);
      if (cancelled) return;

      const [queue, names] = await Promise.all([fetchRankedQueue(...), fetchSourceNames()]);
      if (cancelled) return;
      setRankedQueue(queue);
      setSourceNames(names);
      const activeEdition = getEdition(state.editionContext.activeEdition); // now reads DB-backed EDITIONS
      const firstTopic = activeEdition.taxonomyFieldCodes[0];
      setState(s => reduce(s, selectTopic(firstTopic), {...}));
    } catch (err) {
      if (!cancelled) setLoadError(err.message);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [state.editionContext.activeEdition]);
```

### 2a. Closing the first-render stale-taxonomy gap (per ChatGPT's explicit correction)

**The real gap identified**: `isLoading` already exists in `App.jsx`
(`useState(true)`, confirmed) but per direct read of the component's
render output (`App.jsx:197-224`), it is currently only ever PASSED AS
A PROP to `<ActiveSetList isLoading={isLoading} .../>` — it does not
gate the `<TopicWheel topics={topics} .../>` render at all. `topics`
(a `useMemo` derived from `getEdition(...).taxonomy`/`taxonomyFieldCodes`)
renders on the very first paint, before the bootstrap `useEffect` has
even started running — using whatever `EDITIONS` is at that instant,
which is the `FALLBACK_TAXONOMY_REGISTRY`-derived placeholder (§1).
Sequencing the `await`s inside the effect (§2's original diff) only
prevents `EDITIONS` from being READ with a stale value; it does
nothing to prevent React from RENDERING with the pre-effect value on
that first paint.

**Fix — reuse the existing early-return pattern, no new component.**
`App.jsx` already has this exact shape twice (`App.jsx:178-195`,
confirmed): `if (loadError) return <div className="app-error">...`
and `if (state.brief.open) return <main>...<Brief /></main>`. Add one
more, using the `isLoading` state that already exists:

```js
// Illustrative — not written yet. Placed alongside the existing
// loadError/brief.open early returns, same pattern, same file.
if (isLoading) {
  return <main className="app app--loading">{/* existing loading UI/spinner, whatever App.jsx already shows via ActiveSetList's isLoading path today — reused, not redesigned */}</main>;
}
```

This guarantees the `TopicWheel`/`ActiveSetList`/masthead render
(which reads `topics`/`currentEdition`, both `EDITIONS`-derived) never
happens until the bootstrap effect's `finally { setIsLoading(false) }`
runs — which, per §2's sequencing, only happens after
`loadEditionsFromDB()` has already resolved and reassigned `EDITIONS`.
**No flash of stale/fallback taxonomy is possible once this early
return exists**, because nothing that reads `EDITIONS` renders before
`isLoading` becomes `false`.

Applies identically on edition switch: the effect already sets
`isLoading = true` at its start (`App.jsx:49`, confirmed) and `false`
in its `finally` block — the early return means an edition switch
correctly re-shows the loading state and re-hides the reader content
until the switch's own taxonomy+queue reload completes, per ChatGPT's
diagram exactly.

**Why re-run on every edition switch, not just once**: the existing
effect already re-runs on `state.editionContext.activeEdition` change
(to re-fetch the ranked queue). `loadEditionsFromDB()` re-running on
every switch is harmless (same idempotent read, no side effect) and
keeps the code path uniform — a separate "only on first mount" branch
would be new complexity for no real benefit, since the DB call is
cheap and this project's own `productionAdapter.js` pattern already
re-fetches other backend data on every edition switch too.

**Loading/error state**: `setLoadError(err.message)` already exists
(catch block, confirmed) — a `loadEditionsFromDB()` failure surfaces
through the exact same path a `fetchRankedQueue()` failure already
does. No new UI state, no new component.

## 3. `AdminApp.jsx` bootstrap — independent call

Current auth-session effect (`AdminApp.jsx:35-41`):
```js
useEffect(() => {
  adminSupabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  const { data: sub } = adminSupabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession ?? null));
  return () => sub.subscription.unsubscribe();
}, []);
```

**New, separate effect** (per design §4c — independent of the session
effect, since taxonomy has nothing to do with auth):
```js
const [taxonomyReady, setTaxonomyReady] = useState(false);
const [taxonomyError, setTaxonomyError] = useState(null);

useEffect(() => {
  loadEditionsFromDB(adminSupabase)
    .then(() => setTaxonomyReady(true))
    .catch(err => setTaxonomyError(err.message));
}, []);
```

Every render path that shows real Admin content (Review Queue,
Classification Flow, Editorial Activity Timeline — all of which read
`getEdition()`/`EDITION_IDS` per the design doc's confirmed import)
gates on `taxonomyReady` the same way the component already gates on
`roleChecked`/`session` today — exact gating placement is a normal
implementation detail (likely combined into the same top-level
loading check `AdminApp.jsx` already has for auth), not a new pattern.

**`taxonomyError` also gates, not just `taxonomyReady` (per ChatGPT's
explicit correction)**: the top-level check must be
`if (!taxonomyReady || taxonomyError) return <LoadingOrErrorState />`
— a taxonomy load failure must stop the gate exactly like a missing
session already does, never allowing a "half-ready" Admin page to
render with `EDITIONS` still on its fallback value. Same principle as
§2a's reader-side fix: no code path may render real content using
stale/fallback taxonomy, whether the cause is "still loading" or
"failed to load."

**Which Supabase client**: `adminSupabase`, not the reader's
`supabase` from `productionAdapter.js` — `AdminApp.jsx` already uses
its own client (`adminSupabase.js`, confirmed) for every other query;
`taxonomy_fields` read access needs the same RLS/role treatment as any
other Admin-visible data, no new client instance introduced.

## 4. Migration order

1. Land `state/editions.js` changes (§1) — additive, `EDITIONS` still
   has a valid synchronous value the instant the module loads (the
   fallback), so nothing breaks even before any caller ever calls
   `loadEditionsFromDB()`.
2. Land `App.jsx` change (§2).
3. Land `AdminApp.jsx` change (§3).
4. Deploy together (these three files are interdependent for this one
   feature — landing §1 alone changes nothing observable, but §2/§3
   only work once §1 exists, so they ship as one deploy, not three
   separate ones).

## 5. Rollback

Revert `App.jsx`'s and `AdminApp.jsx`'s new `loadEditionsFromDB()`
calls (each a small, isolated diff — removing one `await`/`useEffect`
block) — `EDITIONS` falls back to being computed once from
`FALLBACK_TAXONOMY_REGISTRY` at module load, exactly today's current
behavior. `state/editions.js`'s own changes (§1) can stay in place
even during a rollback — they're additive and harmless if
`loadEditionsFromDB()` is simply never called.

## 6. Verification

- **Parity test**: capture `EDITIONS` (all 3 editions'
  `taxonomy`/`taxonomyFieldCodes` arrays) computed from
  `FALLBACK_TAXONOMY_REGISTRY` (today's known values), then after
  cutover, capture the same shape from `loadEditionsFromDB()`'s real
  output against production `taxonomy_fields` — 0 mismatches required,
  same discipline as every prior parity check this session.
- **Manual reader check**: load `adjung-quick.vercel.app`, confirm the
  Wheel renders the same 16/16/13 Kategori in the same order, for all
  3 editions, switching between editions to confirm the re-fetch
  sequencing doesn't introduce a flash-of-stale-taxonomy or a hang.
- **Manual Admin check**: load `/admin` directly (fresh tab, no prior
  reader visit) — confirms `AdminApp.jsx`'s independent call actually
  works standalone, not just "happens to work because the reader
  loaded taxonomy first in the same session."
- **Regression**: full `npm test`, 0 failures required (though this
  cutover touches browser-only code paths most of this project's test
  suite doesn't directly exercise — the manual checks above are the
  real verification for this phase).
- **DB-unreachable simulation** (optional, if safely testable): confirm
  the app shows its existing error state rather than silently falling
  back to `FALLBACK_TAXONOMY_REGISTRY`, per design §8's explicit
  requirement.

## What this plan does NOT do

- No code written yet
- Does not introduce Context, a store, or any new state-management primitive
- Does not change `AdminApp.jsx`'s existing auth-session effect —
  taxonomy loading is a separate, independent effect
- Does not redesign any loading/error UI beyond reusing what already exists
- Does not touch `classification/lib/taxonomy-registry.mjs` or
  `classify-production.js` further — those are already cut over
  (commit `698773b`)

## Next

Awaiting ChatGPT's review before code is written.
