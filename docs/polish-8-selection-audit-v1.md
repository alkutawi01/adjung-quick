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

## 8C.1 — Pin position bug + copy tightening (implemented)

Director caught a real Admin/Reader mismatch during 8C review:
`computeFieldRanking()` gave Pin rows `position: null`, but Reader
production puts Pin at the front of the Active Set
(`[...pinned, ...ranked]`, `state/reducer.js`) — Pin genuinely occupies
position 1/2. `NilaiSusunanPanel.jsx` only treats rows with a position as
the final set and sorts them to the top, so with 2 active Pins the Admin
table could show ranked candidates #3–#10 first with the real #1/#2 Pins
buried further down among unranked candidates. The prior fixture only
checked Pin `status`, never `position`, so the bug passed all 26
assertions in the 8C commit.

Fix: `valueRankingAdapter.js`'s `pinned.forEach` now assigns
`position: i + 1` (1, 2) instead of `null`; composed rows were already
offset correctly by `pinned.length`. Also narrowed
`NilaiSusunanPanel.jsx`'s "susunan di bawah ialah apa yang pembaca lihat
sekarang" — technically overclaimed (a given reader's own Active Set can
differ after they release a story, per `RELEASE_STORY` history) — to
"kaedah Nilai & Susunan ini aktif untuk kategori ini" plus a note that a
reader's own order can change after release. No personal-state preview
added to Admin (explicitly out of scope, overengineering).

3 new assertions in `nilaiSusunanPanel.test.mjs`: 2 Pins get position 1/2
(not null), a final set of 10 has continuous positions 1..10, Pin rows
sort before ranked candidates in panel output. 29/29 total. Full suite
otherwise unchanged. Build succeeds. Polish 8C marked CLOSED by the
director after this fix.

## 8D-A — Pin end-to-end audit (implemented)

Director's checklist, audited against existing coverage rather than
rebuilding from scratch (no new functions, per explicit instruction):

- Low-score pin still enters + takes position 1 (single pin), 2 pins ->
  position 1/2 oldest-first, defensive cap on a 3rd pin, released pinned
  story not forced back: all already covered by `state/pin.test.mjs`
  (reducer level) and `nilaiSusunanPanel.test.mjs` (Admin panel level).
- 3rd pin write refused with a readable error (not silently dropped):
  `reviewQueueAdapter.js`'s `submitPinOverride`, covered by
  `db/editor-auth.test.mjs`.
- Hidden story -> pin refused: `submitPinOverride`'s hide-check, already
  tested.
- Pin routes the story into its target field:
  `editorialStateResolver.mjs` already returns
  `fieldCode: pin.new_field_code` when a pin is active (tested).

One real gap found and closed: no test named "unpin falls back to the
right decision" existed, even though the mechanism (`deactivateOverride`
sets `active: false`; the resolver only ever sees `active: true` rows, so
an unpinned row is simply absent from its input) was implicitly exercised
by unrelated fallback tests. Added 3 explicit assertions to
`editorialStateResolver.test.mjs`: pin beats reclassify while active,
falls back to the reclassify decision after unpin, falls back further to
the classifier decision if no reclassify exists either. 18/18 (was
15/15).

Also fixed a stale code comment the director flagged in
`reviewQueueAdapter.js`'s `submitPinOverride`: "no UI currently offers a
pin action" had been false since `AllStoriesPanel.jsx`'s "Kekalkan dalam
pemilihan" action shipped — comment corrected, no logic touched.

**Not done, flagged instead**: the production UAT step the director
specified (a real temporary Pin via the admin UI against production data,
verified, then unpinned and confirmed restored) is a real production
database write. Per this project's standing rule, that requires Izzat's
own explicit approval even when designed to be safely reversible —
pending as of this writing, does not block 8D-B/8D-C.

## 8D-B — Boost V1 decision (read-only simulation, implemented)

Read-only simulation (`lab/boost-v1-simulation.mjs`, kept in the repo per
the director as useful regression/calibration evidence) ran the exact
production pipeline shape — `scoreCandidates()` -> synthetic `+delta` ->
`selectDiverseCandidates()` -> `applyEditorialComposition()` — against
the real production corpus (`ranking/shadow-runner.mjs`'s
`loadFieldCandidates()`, the same read-only loader shadow-mode
comparisons already use). No production code, DB, `BOOST_WEIGHT`, or
`RANKING_FLAGS` touched.

8 categories had >=12 eligible candidates (the director's minimum for a
meaningful test): `ms-MY` politics/dunia/crime/bisnes/sports/
entertainment/religion/lifestyle. 26 other (edition, field) pairs were
too small and skipped, not forced. For each qualifying category, three
non-Pin candidate types were tested — boundary (rank ~11/12), median, and
weak (lower quartile) — each with synthetic `+1`, `+2`, `+3` added
directly to the base score, after `scoreCandidates()` and before
diversity selection (never touching `candidate.boosted`, since
production `BOOST_WEIGHT=0` already).

Result: even `+1`, the smallest delta tested, was enough to send several
median/weak candidates straight to the final set's #1 position. Sharpest
example: `ms-MY.crime`'s weakest tested candidate (real production rank
#22, nowhere near the real top 10) reached score-rank #1 and the final
set's #1 slot with a `+1` delta alone. The same happened for
`ms-MY.dunia` (rank #16 -> #1) and `ms-MY.crime`'s median candidate (rank
#15 -> #1). Aggregate: at `+1`, 6/24 experiments reached #1 and 8/24
reached Top 3 (5 of those 8 were median/weak candidates, not boundary
ones) — the corpus's score formula (freshness + trust + confidence) is
tightly clustered near the top in several categories, the same failure
mode Polish 7C found with synthetic fixtures, now confirmed on the real
production corpus at the smallest tested delta.

This fails the director's locked criterion directly: a safe global weight
must help near-miss candidates without turning median/weak candidates
into Top 3/#1. It also directly answers the director's Boost-vs-Pin
comparison question — a rank #15-22 candidate can leapfrog to #1 from a
`+1` delta alone, a more unpredictable jump than Pin itself (which is
explicit, capped at 2, and audited).

**Decision (director-confirmed): Boost stays OFF for V1.** No
per-category weight, adaptive weight, percentile normalization, or new
formula was considered — explicitly out of scope, unnecessary complexity
for a feature that doesn't clear the bar even at its smallest tested
delta.

## 8D-C — Boost V1 UI cleanup (implemented)

With the Boost-OFF decision final, the director asked for one more small
cleanup: the mounted Admin UI should stop offering an inert "Boost" action
to editors, since the answer is no longer pending. Scope was UI write-path
only — no schema change, no data deletion, no touching orphaned panels.

`AllStoriesPanel.jsx` (the only "Berita" surface `AdminApp.jsx` actually
mounts, per Round 8/15 — `ReviewQueueCard.jsx` has been orphaned since
that change) had it removed: the `submitBoostOverride` import, the
`onBoost` prop/callback, the `composing === 'boost'` branch, its
confirmation copy, and the "Naikkan keutamaan — Belum diaktifkan" dead
label. `AdminApp.jsx`'s own top-level `submitBoostOverride` import (never
actually wired to the mounted path — a leftover from before
`AllStoriesPanel.jsx` replaced `ReviewQueueCard.jsx`) was removed too.

Preserved, per explicit instruction — this removes the ability to CREATE
a new Boost, not the data model: `reviewQueueAdapter.js`'s
`submitBoostOverride()` function itself, `override_type='boost'` and its
schema/resolver support, `BOOST_WEIGHT=0` in `candidate-scoring.mjs`, and
`AllStoriesPanel.jsx`'s read-only "Dinaikkan" tag for stories with a real
historical boost override. `ReviewQueueCard.jsx`/`ValueRankingPanel.jsx`
(both already orphaned, not mounted) were left untouched — not in scope,
per the director's "audit mounted path only" instruction.

New `ui/src/admin/boostV1Cleanup.test.mjs` (8/8): mounted UI has no Boost
write path (no import, no callback, no composer branch, no dead label);
the read-only historical tag still renders; backend `submitBoostOverride`
export and `BOOST_WEIGHT=0` both still exist untouched. Full suite
unaffected (33/33 relevant, same 2 pre-existing unrelated
`editor-auth.test.mjs` failures). `copyLint` 0 violations (20 files,
unchanged count — no new `.jsx` added). Build succeeds.

## Next

Pin's production UAT (a real temporary Pin via the admin UI, verified,
then unpinned and confirmed restored) remains pending Izzat's explicit
approval for the production write — the director will decide whether
that UAT gates closing Polish 8D fully, or whether it's tracked as the
sole deferred item while Polish 8 moves to its next part.
