# Polish 8 — Selection Pipeline Audit + Parity Fix + Unification (8A–8C)

2026-08-20. Polish 8 — "Nilai → Pemilihan 10 → Susunan" — unifies existing
scoring/selection/composition pieces into one clear editorial flow, Admin and
Reader consistent. Written per the same discipline as Polish 6/7: audit
read-only first, get the director's (ChatGPT) explicit approval, then a
minimal, scoped fix.

## 8A — Production selection path audit (read-only)

Confirmed real call graph:

```
productionAdapter.fetchRankedQueue(editionId)
  -> reducer.js::selectFieldActiveSet(eligible, editionId, field, capacity)
       1. extract pinned (cap 2, oldest-first) — BEFORE the branch below
       2. getRankingVersion(editionId, field):
          - 'editorial_v1' (ONLY ms-MY.politics) -> selectEditorialActiveSet()
               scoreCandidates() -> selectDiverseCandidates() -> applyEditorialComposition()
          - everything else ('legacy')           -> plain .slice(0, capacity)
               over the stored `editorial_score` — no scoring engine, no
               diversity dedup, no composition
       3. [...pinned, ...ranked]
  -> Active Set (what the reader sees)
```

**Finding (HIGH, fixed in 8B)**: `ui/src/admin/PemilihanPanel.jsx` and
`ui/src/admin/SusunanAkhirPanel.jsx` (the "Pemilihan 10"/"Susunan Akhir"
sub-panels of "Nilai & Susunan") let an editor pick ANY category from a
dropdown, then unconditionally ran the full `editorial_v1` pipeline
(`selectDiverseCandidates`/`applyEditorialComposition`) for it — with no
check against `getRankingVersion()` — and both panels' copy explicitly
claimed the result was "guna enjin ... SEBENAR (tidak diubah)" / "Set akhir
10 berita yang pembaca akan lihat". True only for `ms-MY.politics`; false for
every other category, whose real Reader just does a plain sorted `.slice()`.
An editor auditing e.g. Ekonomi in Susunan Akhir would see a
composed/diversified result and reasonably (but wrongly) conclude that's what
readers get.

**Findings (LOW, recorded not fixed in 8B, per director's explicit scope
decision)**:
- Pin-extraction logic (filter pinned, cap 2, oldest-first) is duplicated
  across `state/reducer.js`, `ui/src/admin/valueRankingAdapter.js`, and
  `ui/src/admin/kaedahNilaiAdapter.js` with no shared source of truth between
  production and admin. Currently in agreement, real drift risk if
  `reducer.js`'s rule changes later. Not a Polish 8B fix — refactoring three
  call sites was explicitly out of scope ("jangan jadikan 8B projek
  refactor").
- The real Reader (`App.jsx`) only refetches `rankedQueue` on edition switch
  or page reload, not on Bidang (category) switch — an admin's Hide/
  Reclassify/Pin is invisible to an already-open reader tab until reload.
  Architectural (no realtime subscription anywhere in the app), not a
  Polish-8-introduced regression. Deferred to Polish 8E/8F or Polish 9
  robustness, per the director's explicit instruction not to add a realtime
  subscription just to close this — a scoped refetch-on-context-change is
  the cheaper fix to evaluate later.

**Confirmed correct (no issue)**: composition never re-scores/re-ranks (only
ever one array-index replacement); diversity substitution is capped at
exactly one source swap; capacity handling has no padding/filler at any
stage when fewer than 10 candidates are eligible; Pin bypasses the ranking
contest entirely (composition never even sees a pinned candidate in its
input, so it structurally cannot displace one); override propagation is a
live SQL view with no caching layer.

## 8B — Parity & Truthfulness fix (implemented)

Scope, per the director's exact instruction — a minimal fix, not a new UI:

1. `PemilihanPanel.jsx` and `SusunanAkhirPanel.jsx` now import
   `getRankingVersion` from `state/rankingFlags.js` directly — the same
   single authority production uses. Neither panel hardcodes a field code;
   when a category is added to `editorial_v1` in the future, both panels
   follow automatically.
2. For a category where `getRankingVersion(editionId, fieldCode) !==
   'editorial_v1'`: the panel's intro text and the "10 berita yang
   dipilih"/"Set akhir 10 berita" claims switch to simulation language, and a
   notice banner appears: *"Kaedah Nilai & Susunan baharu belum diaktifkan
   untuk kategori ini. Paparan pembaca semasa masih menggunakan susunan
   sedia ada. Keputusan di bawah ialah simulasi — belum digunakan oleh
   pembaca."* No internal terms (`legacy`, `editorial_v1`, file names, flag
   names) are shown to the editor.
3. The underlying computation for non-active categories is UNCHANGED and
   still runs (still useful for calibration/what-if preview) — only the
   labeling changed, from an unqualified production claim to an explicit
   simulation label.
4. Not touched, per explicit instruction: `state/reducer.js`,
   `state/rankingFlags.js`'s `RANKING_FLAGS` table, `diversity-selection.mjs`,
   `editorial-composition.mjs`, Boost activation, the three duplicated
   pin-extraction call sites.
5. New regression test `ui/src/admin/pemilihanSusunanParity.test.mjs`
   (13 assertions, static source checks matching the repo's existing style):
   confirms `ms-MY.politics` resolves to `editorial_v1` and a representative
   set of other categories resolve to `legacy`; confirms both panels import
   the real `getRankingVersion` (not a local reimplementation); confirms
   neither panel hardcodes a second `fieldCode === 'politics'`-style
   authority; confirms both panels carry the required notice/simulation
   labeling. Wired into `npm test`.

Verified: `npx vite build` succeeds; `copyLint` 0 violations;
`ranking/candidate-scoring.test.mjs`, `ranking/boost-scoring.test.mjs`, and
the new parity test all pass individually (the two pre-existing unrelated
`db/editor-auth.test.mjs` failures still block the `&&`-chained `npm test`
script before reaching these files, same as noted in Polish 7D).

## Not touched by 8A/8B

No production database writes. No changes to the `editorial_v1` activation
scope (still `ms-MY.politics` only). No changes to scoring, diversity
selection, or composition logic. Boost stays inactive (weight 0, per Polish
7). The three duplicated pin-extraction call sites and the reader
Bidang-switch staleness gap are recorded above, deferred by explicit
director decision — not silently dropped.

## 8B.1 — copy fixes (implemented)

ChatGPT's review of commit 4914a63 caught two real gaps 8B's tests missed:
`PemilihanPanel.jsx`'s intro paragraph still unconditionally claimed the
engine was "SEBENAR" even for legacy categories (contradicting its own
correctly-conditional notice banner below), and a backend function
reference (`reviewQueueAdapter.js::submitPinOverride`) leaked into the
pin-limit UI copy. Both fixed; `pemilihanSusunanParity.test.mjs` strengthened
11→19 assertions to verify the production-truth claim is literally the
true-branch of an `isActiveProduction` ternary (not just "does the word
Simulasi appear somewhere"), plus a new check forbidding any
`(file.js::function)` leak. Commit `483c021`.

## 8C — Unify the Nilai → Pemilihan 10 → Susunan Akhir experience (implemented)

Read-only navigation/feasibility audit first (per the director's explicit
instruction, before any coding): confirmed `state/reducer.js`'s already-
lifted `scoringCorpus`/`scoringWeights` state (Pusingan 14/15) meant a new
unified parent panel could reuse 100% existing pipeline functions and state
— no new engine, no new state management, satisfying the director's
constraint. One wrinkle found: `ValueRankingPanel.jsx`'s adapter
(`valueRankingAdapter.js`) read from a different source
(`productionAdapter.fetchRankedQueue`, the real reader-facing corpus) than
the other three panels (`kaedahNilaiAdapter.fetchScoringCorpus`, a separate
simulation corpus) — flagged to the director rather than silently picked.

Director's decision: standardize the WHOLE unified surface on
`valueRankingAdapter.js`'s reader-facing corpus (`fetchRankedQueue`) for
every category, active or not — never two different corpus shapes on one
page. Implemented:

- **`valueRankingAdapter.js`** generalized from hardcoded `ms-MY`/`politics`
  constants to `fetchValueRankingData(supabase, editionId, fieldCode)`. Pure
  computation split out into `computeFieldRanking(candidates)` (no I/O) so
  the pipeline behavior is unit-testable with fixtures. Same unmodified
  pipeline throughout: `fetchRankedQueue()` → `scoreCandidates()` →
  `selectDiverseCandidates()` → `applyEditorialComposition()`. Status
  semantics locked to their real pipeline meaning: **Dikekalkan editor**
  (Pin, bypasses the contest), **Kekal** (diversity-selected, survives
  composition), **Masuk** (composition swapped it in), **Keluar**
  (composition swapped it out), **Tidak dipilih** (never in the final set).
  `editorial_boost` reasoning reads the real `scoreBreakdown`/`reasons`
  output (Polish 7D's `editorialBoost > 0` gating) rather than the raw
  `boosted` flag, so a legacy override with zero score contribution is
  never mislabeled.
- **`NilaiSusunanPanel.jsx`** (new): one page, one category dropdown (from
  the edition's real taxonomy, no hardcoded field), one table — Kedudukan |
  Berita | Nilai | Sumber | Status | Sebab. Final set shown first by
  position, remaining candidates below by value, no padding when fewer than
  10 are eligible. No "Kaedah semasa vs Skor V1 simulasi" toggle (retired —
  Polish 7D's calibrated formula already IS the current production
  formula, so that comparison was legacy calibration scaffolding). No
  Pin/Boost action controls (view-only surface by design — Pin/Boost
  actions stay in Polish 8D's scope). `getRankingVersion()` decides the
  page's own label: "Digunakan oleh pembaca" for the active pilot category,
  "Pratonton — belum digunakan oleh pembaca" for every other category —
  same authority, same wording discipline as 8B.
- **`adminRouter.js`**: the four `nilai` page entries collapsed into one
  (`/admin/nilai`, label "Nilai & Susunan"). A small `LEGACY_REDIRECTS` map
  (`resolveRedirect()`) sends the four old URLs
  (`/admin/nilai/data-sebenar`, `/admin/nilai/kaedah`,
  `/admin/nilai/pemilihan`, `/admin/nilai/susunan-akhir`) to `/admin/nilai`
  via `replaceState` — no React Router added, per the director's explicit
  instruction; the router was already a flat static path map, so a lookup
  table is the natural fit.
- **`AdminApp.jsx`** simplified: mounts only `NilaiSusunanPanel` for the
  `nilai` group. Removed from the mounted path: `ValueRankingPanel`,
  `KaedahNilaiPanel`, `PemilihanPanel`, `SusunanAkhirPanel`, the lifted
  `scoringCorpus`/`scoringCorpusError`/`scoringWeights` state, and the
  `fetchScoringCorpus`/`DEFAULT_SCORING_V1_WEIGHTS` imports.
- The four old panel files and `kaedahNilaiAdapter.js` are **not deleted** —
  orphaned only (unreferenced from `AdminApp.jsx`), per the director's
  explicit "jangan buang panel membuta tuli" instruction, so the blast
  radius of this change stays small. Their own pre-existing tests
  (`pemilihanSusunanParity.test.mjs`) still pass unchanged, since the files
  themselves weren't touched. Physical cleanup is a separate, later
  decision.
- `extractPinned` (2 real call sites, `PemilihanPanel.jsx`/
  `SusunanAkhirPanel.jsx` via `kaedahNilaiAdapter.js`) was **not**
  refactored — per the director's explicit instruction not to expand a
  low-severity cleanup into an architecture project when unification didn't
  genuinely require it. `computeFieldRanking()`'s own pin extraction is a
  separate, new implementation (same 2-pin/oldest-first rule, verified by
  test) operating on the reader-facing candidate shape, not a merge of the
  existing helper.

New test `ui/src/admin/nilaiSusunanPanel.test.mjs` (26 assertions): static
checks (exactly one category `<select>`, no `scoreCandidateV1` import, no
"Kaedah semasa"/"Skor V1 simulasi" text, real `getRankingVersion` import, no
hardcoded `'politics'`, both label strings present, no Pin/Boost `onClick`
handlers, adapter still imports the three real pipeline functions, no
hardcoded `RANKED_EDITION_ID`/`RANKED_FIELD_CODE` exports, exactly one
`nilai` route, all four legacy URLs redirect) plus functional fixture tests
against the real `computeFieldRanking()` (2 pins both kept and a 3rd pin
correctly falls back into the normal contest instead of being dropped,
&lt;10 eligible candidates produce no padding, a composition swap produces
at most one "Masuk"/"Keluar" pair, never more). Wired into `npm test`.

Verified: `npx vite build` succeeds (bundle size dropped ~24KB gzipped,
consistent with the four old panels no longer being imported/bundled);
`copyLint` 0 violations (20 files now, up from 19); both
`pemilihanSusunanParity.test.mjs` (13/13, testing the now-orphaned-but-
unchanged old panels) and `nilaiSusunanPanel.test.mjs` (26/26) pass.

## Next

Polish 8D — Pin and Boost decisions: test Pin's real interaction with the
unified selection surface, and decide Boost V1's activation (or continued
inactivity) against real selection behavior rather than isolated score
sensitivity, per the director's Polish 8 roadmap.
