# Staging Restore Runbook v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[x] Implementation pending` `[ ] Closed`

Per ChatGPT: **not an actual restore** — a runbook, written now so that
once the staging Supabase project exists
(`docs/staging-environment-setup-plan-v1.md` §7), the first restore
isn't improvised.

## Flow

```
Production snapshot
        ↓
Staging restore
        ↓
Verify schema
        ↓
Verify classification
        ↓
Verify UI
```

## 1. Production snapshot

- [ ] Record row counts for every table before snapshotting (same
      "snapshot before truncate" lesson already learned the hard way
      once — `docs/production-evidence-persistence-gap.md`'s cascade-delete
      incident)
- [ ] Export via Supabase's own backup/export tooling (mechanism TBD —
      depends on which Supabase plan/tier is chosen,
      `docs/staging-environment-setup-plan-v1.md`'s explicit open
      question)
- [ ] Record the snapshot metadata format already specified in
      `docs/staging-environment-setup-plan-v1.md` §4: snapshot date,
      source, schema version, `classification_ruleset_version`, ranking
      flags active at snapshot time

## 2. Staging restore

- [ ] Restore into the staging project (not production — this is the
      exact mistake the write guard, `docs/production-write-guard-v1.md`,
      exists to make structurally harder, not just this runbook's job to
      remember)
- [ ] Confirm `.env.development`/staging credentials point at the
      staging project, not production, BEFORE running anything

## 3. Verify schema

- [ ] Every table this session touched exists with the right columns —
      specifically the ones that caused real incidents when first
      created: `story_id TEXT` (not UUID) on
      `edition_story_classifications`, `source_known_category` on
      `rss_items`, GRANT + RLS policy present (not just RLS enabled with
      no policy — the silent-0-rows failure mode already hit once)

## 4. Verify classification

- [ ] Run `db/classify-production.js` (dry-run first) against staging,
      confirm coverage percentages are in the same ballpark as the
      snapshot's known state (`docs/production-classification-snapshot-v1.md`
      is the reference baseline for what "normal" looks like)
- [ ] Run `node db/edition-representation-eligibility.test.mjs` and
      `node db/production-classification-acceptance.test.mjs` — both
      already exist, both are pure/deterministic, both should pass
      identically on staging as they did during this session's original
      runs

## 5. Verify UI

- [ ] Point the local dev server at staging credentials
- [ ] Re-run the same checklist already used this session for the Real
      User Acceptance Test (`docs/real-user-acceptance-test-v1.md`) —
      edition journey, Active Set behaviour, empty-field handling — this
      time confirming staging behaves the same way production did, not
      re-discovering new bugs

## What this runbook does NOT cover

- Automated/scheduled snapshot refresh — explicitly out of scope for
  MVP (`docs/staging-environment-setup-plan-v1.md` §4: manual snapshot
  only, no auto-sync)
- The actual restore mechanism's exact commands — depends on which
  Supabase tier/plan gets chosen, not decided yet

## Next

This runbook is ready to execute the FIRST TIME staging actually exists.
Not runnable today — no staging project created yet.
