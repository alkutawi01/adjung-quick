# Phase 1 Source Registry — Cutover Completion: Verification Record

Live production verification, run 2026-08-18, per the 7-step plan in
`docs/control-plane-phase1-cutover-completion-implementation-plan-v1.md`
and ChatGPT's additional "authority divergence" requirement. Test source:
`rss-jaipp` (JHEAIPP Pulau Pinang) — lowest trust score (80), niche
authority feed, chosen deliberately for minimal reader impact.

## Results

| Step | Action | Result |
|---|---|---|
| 1 | Record original state | `rss-jaipp`: `status=active, active=true, trust_score=80` |
| 2 | Toggle via real `setSourceStatus()` (admin adapter) | `public.sources` row became `status=disabled, active=false` — the invariant fix held automatically, no manual second write needed |
| 3 | `db/ingest-production.js --dry-run` | `41/43 sources` fetched (43 total − `rss-kpm` pre-existing disabled − `rss-jaipp` just disabled = 41) — proves ingestion reads `public.sources` and honors the toggle. Dry-run stopped before swap; production tables untouched |
| 4 | `db/daily-observation.mjs` | Ran clean against the new `sources` schema (`id, name, status` select) with no errors; `rankingPilots` step succeeded, which only works if `shadow-runner.mjs`'s new DB-based trust query also succeeded |
| 5 | `shadow-runner.mjs` trust score check | Direct comparison: 3 sampled candidates' `trustScore` from `loadFieldCandidates()` matched `public.sources.trust_score` exactly |
| 6 | Confirm zero writes to `sources_registry_staging` | Staging row for `rss-jaipp` still shows `status=active, updated_at=2026-08-16` (predates this test) — proves the admin adapter did not touch it. Grep confirms the only remaining `sources_registry_staging` writer in the codebase is `backfill-source-registry-staging.mjs`, a manual one-off script, not something the running system calls |
| 7 | Revert + regression | `setSourceStatus()` back to `active` — confirmed `status=active, active=true, trust_score=80`, exact match to original. Full `npm test`: 24/24 pass |

## The chain proven, per ChatGPT's requirement

```
Admin adapter (setSourceStatus)
        ↓
public.sources                          ← changed, confirmed by direct read
        ↓
ingest-production.js                    ← confirmed via --dry-run source count (41/43)
        ↓
daily-observation.mjs                   ← ran clean against new schema
        ↓
shadow-runner.mjs                       ← trust_score confirmed matching DB, sampled
```

And the negative proof:

```
Admin adapter
        ✕
sources_registry_staging                ← confirmed unchanged (stale 2026-08-16 row, no new write)
```

## Side effects (expected, not test artifacts)

- `db/daily-observation.mjs` wrote its normal `operational_snapshots` row and a local `db/observations/observation-2026-08-18.json` file — this is the script's designed behavior on every run, not something specific to this test. The snapshot reflects the moment `rss-jaipp` was briefly disabled; no cleanup needed since it's historical observational data, not live state.
- No production `sources`, `sources_registry_staging`, or ingestion tables were left in a different state than before this verification — `rss-jaipp` is back to its exact original row.

## Conclusion

All 7 steps pass. The full chain — admin edit → `public.sources` →
ingestion → monitoring/ranking — is proven live, not just by code
inspection. `sources_registry_staging` receives zero writes and is
confirmed safe to formally retire (Item 3) whenever convenient; nothing
in this verification depends on it remaining.

Phase 1 Source Registry cutover completion: **CLOSED**, pending ChatGPT's
final review.
