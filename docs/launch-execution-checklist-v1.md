# Launch Execution Checklist v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[x] Implementation pending` `[ ] Closed`

Per Izzat's decision (Option A, `docs/launch-candidate-review-v1.md`) and
ChatGPT's concrete launch sequence. This is a **checklist to execute
against**, not a new design document — every item below already has a
supporting document from this session's work.

Label: **Adjung Quick v1.0 Launch** (deliberately not "final" — per
ChatGPT, monitoring, restore rehearsal, source intelligence refinement,
and the Editorial Value Dimension remain open, accepted, post-launch
work per Option A).

## The sequence

```
1. Freeze release candidate
        ↓
2. Snapshot production
        ↓
3. Build verification
        ↓
4. Vercel deployment
        ↓
5. Smoke test
        ↓
6. Launch record
```

## 1. Freeze release candidate — ✅ DONE 2026-08-13

- [x] Confirm current branch/commit is what ships — no in-flight
      uncommitted changes (`git status` clean) — confirmed clean
- [x] Confirm ranking flag state: `ms-MY.Politik` → `editorial_v1`,
      everything else → `legacy` (`state/rankingFlags.js`) — confirmed
- [x] Tag this commit as the release candidate: `v1.0.0-rc1` (local tag
      only — **not pushed to origin**, per standing practice of
      confirming again before any shared/remote action)

## 2. Snapshot production — ✅ DONE 2026-08-13

- [x] Ran `node db/snapshot-production.mjs` (first attempt hit the
      known transient "JWT issued at future" clock-skew error, same as
      earlier this session — retry succeeded)
- [x] Recorded: snapshot date 2026-08-13, ruleset v1.3.0 — 43 sources /
      865 story_clusters / 917 rss_items / 867 placements

## 3. Build verification — ✅ DONE 2026-08-13

- [x] `vite build` (the actual Vercel `buildCommand` per `vercel.json`)
      completes with zero errors — 96 modules, `ui/dist` produced
      (note: root `package.json` has no `"build"` script of its own;
      Vercel calls `vite build` directly per `vercel.json`, which is why
      this still works — not a gap, just worth knowing)
- [x] Full test suite passing: engine+state (54/54), production write
      guard (8/8), snapshot regression (5/5), editorial composition
      (10/10), shadow-runner chunking (7/7) — 84/84 total
- [x] `.env.example` confirmed correct: `DATABASE_ENV` documented,
      `CONFIRM_PRODUCTION_WRITE` documented but commented out (not set
      by default)

## 4. Vercel deployment — ✅ DONE 2026-08-13

- [x] Target confirmed: Vercel project `adjung-quick`
      (`prj_12KgDObW4YHH9bOIXcZiea4PgjNV`), linked to GitHub
      `alkutawi01/adjung-quick` for auto-deploy on push to `main`
      (discovered live — not a separate manual Vercel deploy step)
- [x] Deployed via `git push origin main` + `git push origin v1.0.0-rc1`
      (commit `e5c20a7`)
- [x] Confirmed live: `https://adjung-quick.vercel.app` serving bundle
      `index-BMDsxkuX.js` — matches the exact hash from Step 3's local
      `vite build`

## 5. Smoke test — ✅ DONE 2026-08-13

- [x] Live URL loads, Active Set renders for `ms-MY` (default Politik)
- [x] Switched to `en-global` — UI chrome + Bidang names correctly in
      English
- [x] Switched to `ar-global` — `<main dir="rtl">` confirmed, Arabic
      Bidang names render correctly
- [x] `ms-MY.Politik` showing ranking pilot output (editorial_v1)
- [x] Swiped/released a card — replaced with a genuinely different
      Politik story (not vanished, not stuck) — confirms the
      `RELEASE_STORY` topic-scoping fix works live in production
- [x] No console errors on initial load

## 6. Launch record — ✅ Adjung Quick v1.0 Launch — 2026-08-13

- **Deployed commit:** `e5c20a7` (tagged `v1.0.0-rc1`)
- **Live URL:** `https://adjung-quick.vercel.app` (not on a public
  domain yet — known only to Izzat, per his own decision)
- **Smoke test result:** all checks passed, no blockers found
- **Accepted-risk items carried into the post-launch backlog** (per
  Option A, `docs/launch-candidate-review-v1.md`): restore rehearsal,
  monitoring, deployment rollback (non-ranking), source precision,
  niche field coverage (Bencana/Kesihatan/Alam Sekitar), Editorial Value
  Dimension
- See `docs/launch-readiness-gate-v1.md` and
  `docs/launch-candidate-review-v1.md` for full context

## What this checklist does NOT authorize

Writing this checklist is documentation, not action. Steps 4 (Vercel
deployment) and the git tag/push in step 1 are real, hard-to-reverse,
shared-system actions — each still requires Izzat's explicit
confirmation at the moment it happens, per standing practice this
session. This document exists so that when that confirmation comes, the
sequence is already agreed and nothing is decided ad hoc under time
pressure.
