# Backend Control Plane — Phase 3: Admin Read-Only V1 Implementation Plan

Status: PLAN ONLY. No UI code in this document, per ChatGPT's "Jangan
tulis UI dahulu." Builds on `control-plane-phase3-admin-readonly-design-v1.md`
(approved). Describes what will be built and in what order.

## 1. Read adapter — `ui/src/admin/classificationRulesAdapter.js`

Two functions, mirroring `editorialActivityAdapter.js`'s plain-query
shape (no RPC for reads, per Phase 2's established correction):

- `fetchClassificationRules(supabase)` — `.from('classification_rules').select('id, rule_type, edition_id, pattern, field_code, subject_code, priority, status, created_by, created_at')`, plus an embedded join for source-rule display names: `sources:pattern(name)` is NOT usable here (pattern isn't declared as an FK — Design V1 §4c deliberately validates it at the RPC layer only, not via a DB constraint, since one shared `pattern` column can't carry a type-conditional FK). Instead, fetch `sources` separately (`.from('sources').select('id, name')`, already small, already fetched elsewhere in Admin) and join client-side by `pattern === sources.id` for `rule_type = 'source'` rows only. No new query complexity, no schema change.
- `fetchClassificationRulesByIds(supabase, ids)` — **batch** fetch, `.in('id', ids)`, returns a `Map<id, rule>`. This is the ONLY way `classification_rule` ids ever get resolved to rule detail — see §3's revision below. Deduplicates `ids` before querying (a Review Queue page may have several stories pointing at the same rule).

Both read `classification_rules` via the `authenticated`-scoped RLS policy already live in production (Phase 3's schema apply) — no new grant, no new policy.

**Revision, per ChatGPT's correction**: the original plan's
`fetchClassificationRuleById(supabase, id)` (a single-row fetch called
from inside the presentational provenance component) is **withdrawn** —
replaced by the batch function above, called once by whichever screen
loads a list of stories, never per-row.

## 2. Admin component — `ui/src/admin/ClassificationRulesList.jsx`

Structure, directly mirroring `EditorialActivityTimeline.jsx`:

- `useState`/`useEffect` load on mount via `fetchClassificationRules()`.
- Three states: `rules === null` (loading, shows `admin-app__status` "Memuatkan..." — the exact existing class), fetch error (shows an error message, same pattern as the Timeline's `activity-timeline__error`), and loaded (renders the list or the empty state).
- Empty state string exactly as locked in the design doc §4 — this is V1's actual production state, so it must render correctly and read as "expected," not "something's missing."
- Filter state: 4 independent `useState` values (`filterType`, `filterStatus` defaulting to `'active'`, `filterEdition`, `filterField`) — plain client-side `.filter()` chaining over the already-fetched list, no query re-fetch per filter change (table is small by construction, per the design doc's own reasoning).

  **Revision, per ChatGPT's correction — resolving a real contradiction**:
  `filterStatus` defaults to `'active'` means **archived rows are hidden
  by default**, exactly like `FilterRulesManager.jsx`'s existing filter
  behavior for editorial rules. The Status filter offers 3 values:
  Aktif (default) / Diarkibkan / Semua. This is the LIST view only — it
  has no bearing on the provenance component (§3), which never applies
  this filter at all, since a story's history must stay visible
  regardless of the list's current viewing preference.
- One list item per rule, per the design doc §2's exact field list. Reuses `filter-rules__row--inactive`'s class-naming convention (new class `classification-rules__row--archived`, same visual intent, not literally the same class name since it's a different component's stylesheet scope — consistent naming pattern, not copy-pasted CSS).
- No `onAdd`/`onToggle`/`onDelete` props anywhere in this component's signature — enforced by omission, not by a disabled-button visual (a disabled button invites "why can't I click this," an absent one doesn't; matches the design doc §6's "every row is inert").

## 3. Provenance display — `ClassificationProvenance.jsx`, purely presentational (REVISED to remove the N+1 risk)

**The original plan had `ClassificationProvenance` call
`fetchClassificationRuleById()` internally, once per story.** ChatGPT
correctly identified this as an N+1 risk: a Review Queue page with 20
`admin_rule`-classified stories would fire 20 separate
`classification_rules` queries alongside the 1 query that loaded the
stories themselves — unnecessary, and avoidable without any new
caching/context/store machinery.

**Revised component contract**: `ClassificationProvenance` takes
`{ classificationMethod, resolvedRule }` as props — `resolvedRule` is
either `null` (non-`admin_rule` methods never need one) or an
already-fetched `classification_rules` row object. **The component itself
never queries anything.** All data loading is the caller's
responsibility, via one of two paths depending on context:

- **List/Review Queue context** (many stories at once): the parent
  screen collects every distinct `classification_rule` id present among
  the stories it already loaded, calls `fetchClassificationRulesByIds()`
  **once** for the whole batch, and passes each story's resolved rule (or
  `null`) down as a prop. One extra query total, regardless of how many
  stories in the batch used `admin_rule`.
- **Single story-detail context** (only one story, no list): the same
  batch function still applies, just called with a 1-element id array —
  no separate "single fetch" code path needs to exist; `fetchClassificationRulesByIds([id])`
  is already the right shape for both cases, so there's exactly one read
  function for this purpose, not two.

Rendering logic, unchanged from the original design:

- `classificationMethod !== 'admin_rule'` → renders the "Ditentukan oleh:
  Classifier" shape, translating `classificationMethod` to one of the 5
  Malay labels via a plain lookup object. `resolvedRule` is ignored in
  this branch (expected to be `null`, but the component doesn't need to
  assert that — it simply never reads it here).
- `classificationMethod === 'admin_rule'` → renders the "Ditentukan oleh:
  Peraturan Klasifikasi" shape directly from `resolvedRule`'s fields,
  **including when `resolvedRule.status === 'archived'`** (renders
  "Status: Diarkibkan") — the locked invariant from the design review:
  this component has no filter of its own, whatever rule the parent
  handed it is what renders, unconditionally. If `resolvedRule` is
  unexpectedly `null` for an `admin_rule` story (should not happen since
  rules are archived, never deleted, but defensively handled), renders a
  neutral "Peraturan tidak dijumpai" fallback rather than crashing.

## 4. What this plan does NOT touch (explicit, per the GO's boundary list)

- No RPC (`add_classification_rule` / `archive_classification_rule` /
  `restore_classification_rule`) is called anywhere in this plan's scope.
- No change to `classification/lib/classification-rules-resolver.mjs` or
  `classification/edition-classification.mjs` — the classifier is
  already done and live (commit `6473abd`).
- No schema/RPC SQL changes — Phase 3's backend is already applied to
  production and verified.
- No new state-management primitive (no Context, no store, no provider)
  — plain component-local `useState`, matching every other Admin screen
  in this codebase. The batch-fetch-then-pass-as-props pattern in §3 is
  ordinary prop drilling, not a new primitive.

## 5. Test plan

1. **Adapter unit tests** (`ui/src/admin/classificationRulesAdapter.test.js`,
   run against a mocked Supabase client, matching this project's existing
   adapter-test convention): `fetchClassificationRules()` returns `[]`
   correctly for the true 0-row production state; correctly joins source
   names for `rule_type = 'source'` rows only (a `url`/`keyword` row's
   pattern is never looked up against `sources`); `fetchClassificationRulesByIds()`
   deduplicates its input ids before querying, issues exactly one query
   regardless of batch size, and returns a `Map` with `null`/missing
   entries handled gracefully for any id that doesn't resolve.
2. **Component tests covering every case ChatGPT listed**:
   - 0 rules → empty state string renders exactly.
   - A mix of `active` and `archived` rows, default filter (Aktif) →
     **archived rows are hidden**; selecting Diarkibkan shows only
     archived; selecting Semua shows both. (Corrected from the original
     plan's contradictory claim that both stayed visible under the
     default filter.)
   - All 3 `rule_type` values render their type-specific display
     correctly (source shows resolved name, url/keyword show raw pattern).
   - A global rule (`edition_id = null`) renders "(global)" and its raw
     `subject_code`, never a resolved-for-one-edition label; an
     edition-specific rule renders its edition's display label and
     resolved Kategori label.
   - Each of the 4 filters, individually and combined, narrows the
     rendered list correctly.
   - `ClassificationProvenance` given `classificationMethod = 'admin_rule'`
     and a `resolvedRule` with `status: 'active'` → renders full rule
     detail, "Status: Aktif" — **and asserts zero network calls made by
     the component itself** (it's purely presentational; this is the
     direct regression test for the N+1 fix).
   - Same, with `status: 'archived'` → renders full rule detail, "Status:
     Diarkibkan" — not hidden, and again zero component-internal fetches.
   - `ClassificationProvenance` with any non-`admin_rule` method → renders
     the Classifier shape with the correct Malay label for each of the 5
     method values (including `none`/unclassified), `resolvedRule` ignored.
   - A parent-level test (e.g. a mock Review Queue with several
     `admin_rule` stories sharing 2 distinct rule ids) confirms
     `fetchClassificationRulesByIds()` is called exactly once, with a
     deduplicated id list, regardless of story count.
3. **Full `npm test` / existing frontend test suite** — 0 regressions,
   same gate every prior phase has used.

## Explicitly out of scope (carried forward)

Attention Rules, Pin automation, generic rule engine, ranking/scoring, any
Add/Edit/Archive control surface (V2), a new generic table/grid
component, and `edition-rules.mjs`'s `foreign_politics_to_world` display.
