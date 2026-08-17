# Backend Control Plane — Phase 3: Admin Read-Only V1 Implementation Plan

Status: PLAN ONLY. No UI code in this document, per ChatGPT's "Jangan
tulis UI dahulu." Builds on `control-plane-phase3-admin-readonly-design-v1.md`
(approved). Describes what will be built and in what order.

## 1. Read adapter — `ui/src/admin/classificationRulesAdapter.js`

Two functions, mirroring `editorialActivityAdapter.js`'s plain-query
shape (no RPC for reads, per Phase 2's established correction):

- `fetchClassificationRules(supabase)` — `.from('classification_rules').select('id, rule_type, edition_id, pattern, field_code, subject_code, priority, status, created_by, created_at')`, plus an embedded join for source-rule display names: `sources:pattern(name)` is NOT usable here (pattern isn't declared as an FK — Design V1 §4c deliberately validates it at the RPC layer only, not via a DB constraint, since one shared `pattern` column can't carry a type-conditional FK). Instead, fetch `sources` separately (`.from('sources').select('id, name')`, already small, already fetched elsewhere in Admin) and join client-side by `pattern === sources.id` for `rule_type = 'source'` rows only. No new query complexity, no schema change.
- `fetchClassificationRuleById(supabase, id)` — single-row fetch, used by the provenance display (§3) to resolve a story's `classification_rule` id into type/pattern/target/status. Returns `null` if the id doesn't resolve to any row (defensive — should not happen since rules are archived, never deleted, but the read path stays honest about the possibility rather than assuming).

Both read `classification_rules` via the `authenticated`-scoped RLS policy already live in production (Phase 3's schema apply) — no new grant, no new policy.

## 2. Admin component — `ui/src/admin/ClassificationRulesList.jsx`

Structure, directly mirroring `EditorialActivityTimeline.jsx`:

- `useState`/`useEffect` load on mount via `fetchClassificationRules()`.
- Three states: `rules === null` (loading, shows `admin-app__status` "Memuatkan..." — the exact existing class), fetch error (shows an error message, same pattern as the Timeline's `activity-timeline__error`), and loaded (renders the list or the empty state).
- Empty state string exactly as locked in the design doc §4 — this is V1's actual production state, so it must render correctly and read as "expected," not "something's missing."
- Filter state: 4 independent `useState` values (`filterType`, `filterStatus` defaulting to `'active'`, `filterEdition`, `filterField`) — plain client-side `.filter()` chaining over the already-fetched list, no query re-fetch per filter change (table is small by construction, per the design doc's own reasoning).
- One list item per rule, per the design doc §2's exact field list. Reuses `filter-rules__row--inactive`'s class-naming convention (new class `classification-rules__row--archived`, same visual intent, not literally the same class name since it's a different component's stylesheet scope — consistent naming pattern, not copy-pasted CSS).
- No `onAdd`/`onToggle`/`onDelete` props anywhere in this component's signature — enforced by omission, not by a disabled-button visual (a disabled button invites "why can't I click this," an absent one doesn't; matches the design doc §6's "every row is inert").

## 3. Provenance display — a new small presentational component, `ClassificationProvenance.jsx`

Takes `{ classificationMethod, classificationRule }` as props (already
fetched wherever a story's classification is already shown — Review
Queue card, Activity Timeline, or any future story-detail view; this
plan does not add a new screen, only a reusable block other screens can
drop in later). Internally:

- If `classificationMethod !== 'admin_rule'` → renders the "Ditentukan
  oleh: Classifier" shape (design doc §5), translating `classificationMethod`
  to one of the 5 Malay labels via a plain lookup object (`edition_rule`
  → "Peraturan Edisi", etc.) — no new data fetch needed, this branch only
  reads props already present.
- If `classificationMethod === 'admin_rule'` → fetches the rule via
  `fetchClassificationRuleById(supabase, classificationRule)` and renders
  the "Ditentukan oleh: Peraturan Klasifikasi" shape, **explicitly
  including archived rules** — per ChatGPT's locked correction, this
  component never filters by `status`, it renders whatever row comes
  back and shows "Status: Diarkibkan" when applicable. This is the one
  invariant ChatGPT specifically flagged as needing to be explicit rather
  than assumed, so it's called out here as its own bullet rather than
  folded into the general fetch description: **the rules list's default
  Aktif filter (§2) has zero effect on this component — they read from
  two different code paths, the filter only ever touches the list
  view's own local state.**

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
  in this codebase.

## 5. Test plan

1. **Adapter unit tests** (`ui/src/admin/classificationRulesAdapter.test.js`,
   run against a mocked Supabase client, matching this project's existing
   adapter-test convention): `fetchClassificationRules()` returns `[]`
   correctly for the true 0-row production state; correctly joins source
   names for `rule_type = 'source'` rows only (a `url`/`keyword` row's
   pattern is never looked up against `sources`); `fetchClassificationRuleById()`
   returns `null` for a nonexistent id rather than throwing.
2. **Component tests covering every case ChatGPT listed**:
   - 0 rules → empty state string renders exactly.
   - A mix of `active` and `archived` rows → archived rows render with
     the dimmed/inactive visual treatment; both remain visible under the
     default filter set until Status is explicitly changed.
   - All 3 `rule_type` values render their type-specific display
     correctly (source shows resolved name, url/keyword show raw pattern).
   - A global rule (`edition_id = null`) renders "(global)" and its raw
     `subject_code`, never a resolved-for-one-edition label; an
     edition-specific rule renders its edition's display label and
     resolved Kategori label.
   - Each of the 4 filters, individually and combined, narrows the
     rendered list correctly.
   - `ClassificationProvenance` with `classification_method = 'admin_rule'`
     pointing at an ACTIVE rule → renders full rule detail, "Status: Aktif".
   - Same, pointing at an ARCHIVED rule → renders full rule detail,
     "Status: Diarkibkan" — **not** hidden, per §3's locked invariant.
   - `ClassificationProvenance` with any non-`admin_rule` method → renders
     the Classifier shape with the correct Malay label for each of the 5
     method values (including `none`/unclassified).
3. **Full `npm test` / existing frontend test suite** — 0 regressions,
   same gate every prior phase has used.

## Explicitly out of scope (carried forward)

Attention Rules, Pin automation, generic rule engine, ranking/scoring, any
Add/Edit/Archive control surface (V2), a new generic table/grid
component, and `edition-rules.mjs`'s `foreign_politics_to_world` display.
