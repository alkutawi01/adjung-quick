# Polish 8 — Selection Pipeline Audit + Parity Fix (8A/8B)

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

## Next

Polish 8C — unify the Nilai → Pemilihan 10 → Susunan Akhir editor experience
so these no longer feel like three separate tools; also simplify/retire the
"Kaedah semasa" vs "Skor V1 simulasi" comparison mode now that Polish 7D's
calibrated formula IS the current production formula for the pilot, per the
director's explicit note not to let the UI carry old experiment history
forward.
