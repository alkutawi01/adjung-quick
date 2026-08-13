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

## 1. Freeze release candidate

- [ ] Confirm current branch/commit is what ships — no in-flight
      uncommitted changes (`git status` clean)
- [ ] Confirm ranking flag state: `ms-MY.Politik` → `editorial_v1`,
      everything else → `legacy` (`state/rankingFlags.js`)
- [ ] Tag this commit as the release candidate (e.g. `v1.0.0-rc1`) —
      **requires explicit confirmation before tagging/pushing**

## 2. Snapshot production

- [ ] Run `node db/snapshot-production.mjs` one final time immediately
      before deploy, so the local snapshot used for any last-minute
      verification reflects the actual data going live
- [ ] Record snapshot date + ruleset version in this document once run

## 3. Build verification

- [ ] `npm run build` (or equivalent) completes with zero errors
- [ ] Run full test suite: ranking tests, write-guard tests, snapshot
      regression tests — all passing before proceeding
- [ ] Confirm `.env.example` reflects required production env vars
      (`DATABASE_ENV=production`, `CONFIRM_PRODUCTION_WRITE` documented,
      not set by default)

## 4. Vercel deployment

**Real, hard-to-reverse action — requires Izzat's explicit go-ahead at
this exact step, not implied by the checklist existing.**

- [ ] Confirm target: production Vercel project/domain
- [ ] Deploy
- [ ] Confirm deployment URL is live and serving the new build

## 5. Smoke test

- [ ] Load the live URL, confirm Active Set renders for `ms-MY`
- [ ] Switch edition to `en-global`, confirm i18n/locale correctness
- [ ] Switch edition to `ar-global`, confirm RTL renders correctly
- [ ] Confirm `ms-MY.Politik` shows ranked (not legacy) ordering
- [ ] Swipe/release one card, confirm replacement behavior works live
- [ ] Confirm no console errors on initial load

## 6. Launch record

- [ ] Record actual launch date/time, deployed commit hash, and result
      of smoke test in this document
- [ ] Update `docs/launch-readiness-gate-v1.md` and
      `docs/launch-candidate-review-v1.md` to reference this record
- [ ] Explicitly reconfirm the accepted-risk items (monitoring, restore
      rehearsal, deployment rollback beyond ranking, source precision,
      Editorial Value Dimension) as the standing post-launch backlog

## What this checklist does NOT authorize

Writing this checklist is documentation, not action. Steps 4 (Vercel
deployment) and the git tag/push in step 1 are real, hard-to-reverse,
shared-system actions — each still requires Izzat's explicit
confirmation at the moment it happens, per standing practice this
session. This document exists so that when that confirmation comes, the
sequence is already agreed and nothing is decided ad hoc under time
pressure.
