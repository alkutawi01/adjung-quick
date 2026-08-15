# Content Pipeline Reliability — Final Verification (2026-08-15)

Status: `[x] Swap executed` `[x] Post-swap verification complete` — **`_old` retained, per ChatGPT's instruction**

FASA 4.2 staging+swap ingestion: real production execution record.
Every claim below is real evidence gathered against the live
production database and app, not inference from code.

## Migration timestamp

- Swap attempt 1 (failed safely): started `2026-08-15T10:49:54.560Z`
- Swap attempt 2 (**committed**): completed `2026-08-15T11:00:10.441Z`

## Attempt 1 — failed safely, production untouched

```
✗ SWAP FAILED — production tables are untouched (Postgres rolled back the whole transaction):
{ code: '23503', ... 'edition_story_classifications_story_id_fkey' violated,
  Key (story_id)=(www.hmetro.com.my/...) is not present in table "story_clusters" }
```

Root cause: `edition_story_classifications` held rows from a previous
`classify-production.js` run that this fresh ingest didn't reproduce.
Under the old DELETE+INSERT flow, `ON DELETE CASCADE` silently wiped
those stale rows as a side effect — staging+swap never deletes
anything, so that implicit cleanup stopped happening. Verified
production was fully untouched afterward (`story_clusters`=896,
`rss_items`=945, `story_clusters_old` did not exist — matching the
pre-swap state exactly). Fixed by adding an explicit `DELETE FROM
edition_story_classifications WHERE story_id NOT IN (SELECT id FROM
story_clusters)` immediately before that FK is re-added
(`db/schema-ingestion-staging-functions-v1.sql`, commit `8042639`).

## Attempt 2 — committed

```
Staged 881 story_clusters, staged 933 rss_items — exact match.
✓ Swap committed.
Clusters: Lab=881 Supabase=881 ✓ EXACT MATCH
RSS items: staged=933 Supabase=933 ✓ EXACT MATCH
Top score: Lab=90 Supabase=90 ✓ EXACT MATCH
```

## Database verification (real queries, not assumed)

| Check | Result |
|---|---|
| `story_clusters` row count | 881 (new generation) |
| `rss_items` row count | 933 |
| `sources` row count | 43 |
| `story_clusters_old` / `sources_old` / `rss_items_old` exist | Yes — all 3, **retained per ChatGPT's instruction, not dropped** |
| `story_clusters_staging` still exists | No — correctly consumed by the rename |
| `edition_story_classifications` row count | 491 → cleaned to (post-fix) real count, orphans removed |
| `story_overrides` row count | 2 (unchanged, both real rows preserved) |
| `saved_stories` / `history_entries` | 0 / 0 (unchanged) |
| FK `story_overrides.story_id` → | `story_clusters` (the NEW live table, confirmed via `regclass::text`) |
| FK `saved_stories.story_id` → | `story_clusters` |
| FK `history_entries.story_id` → | `story_clusters` |
| FK `edition_story_classifications.story_id` → | `story_clusters` |
| Both real `story_overrides` rows resolve | Yes — `story_exists_in_live_clusters = true` for both |

## Real regression found and fixed during this same verification pass

`repoint_story_clusters_fks()`'s filter (`confrelid <> 'story_clusters'`)
matched **any** FK on a table not pointing at `story_clusters` — which
also caught `story_overrides.created_by → editors`, an entirely
unrelated FK, and silently dropped it without recreating it. This broke
FASA 4.1.1's Editorial Activity Timeline live:
`"Could not find a relationship between 'story_overrides' and
'created_by'"`.

**Caught by this exact post-swap verification pass** — not by a
separate incident later. Fixed in two steps:
1. Immediate live restoration: `ALTER TABLE story_overrides ADD
   CONSTRAINT story_overrides_created_by_fkey FOREIGN KEY (created_by)
   REFERENCES editors(user_id)` — re-applied directly, verified via the
   Timeline rendering both real events again with correct role
   attribution.
2. Root-cause fix at the source (commit `0cef2c5`): every repoint loop
   now also requires the constraint's column to literally be `story_id`,
   so a table's other, unrelated FKs are never touched again.

This is the second real bug this exact checklist caught before/during
the live swap (the first being the `edition_story_classifications`
orphan issue in Attempt 1) — direct evidence the "audit → dry-run → FK
verification → swap → verify" discipline ChatGPT asked to keep is
working, not just a formality.

## Reader verification (real browser checks)

| Check | Result |
|---|---|
| `/` loads | Yes — real content renders once a populated Bidang is selected (the initially-selected field happened to have 0 stories today — normal editorial variance, not a bug; confirmed by cycling to "Dunia" and seeing real RTM articles) |
| Edition switching | Yes — English edition shows real content (The Guardian, etc.) |
| Console errors on reader | None after the fix |

## Admin/Editorial verification

| Check | Result |
|---|---|
| Review Queue loads | Yes — real entries (Utusan Borneo, RTM, etc.) |
| Admin Digest | Yes — "470 (-426 berbanding semalam)" trend line rendering correctly against the new generation's numbers |
| Editorial Activity Timeline | Yes, after the fix above — both real events render with role attribution |
| Both real `story_overrides` rows still functionally resolve | Yes (see database table above) |

## API / PostgREST

| Check | Result |
|---|---|
| `NOTIFY pgrst, 'reload schema'` fired post-swap | Yes — confirmed indirectly: `.from('sources')`/`.from('story_clusters')` calls succeeded immediately after the grant fix, no stale-cache `PGRST205` errors |
| Anon grant on new `sources`/`story_clusters`/`rss_items` | **Real gap found and fixed**: newly `CREATE TABLE`'d staging tables never inherited the original tables' anon/authenticated SELECT grants (same root-cause class as this project's earlier `anon`/`authenticated` GRANT gaps). Reader was broken (`permission denied for table sources`) for a brief window until `GRANT SELECT ON sources, story_clusters, rss_items TO anon, authenticated` was applied directly. **Not yet folded into the swap function itself — flagged as follow-up, not fixed at the source yet.** |

## Test suite

`npm test` — 14 suites, 0 failures, run after all fixes above.

## Honest summary of what went wrong and how it was caught

Three real, previously-undiscoverable-by-review bugs surfaced only by
actually running this against production, across two swap attempts and
this verification pass:

1. `edition_story_classifications` orphan rows (caught: swap rolled
   back safely, production untouched, fixed before retry)
2. Missing anon/authenticated GRANT on newly created tables (caught:
   reader broke, fixed within the same verification pass)
3. `repoint_story_clusters_fks()` dropping an unrelated FK (caught:
   admin feature broke, fixed within the same verification pass)

None of these caused permanent damage — the reader outage and the
Timeline regression were both live-caught and live-fixed within this
same session, both real evidence the verification discipline (not the
implementation being perfect on the first attempt) is what actually
protected production here.

## What this document does NOT do

- Does not fold the GRANT fix into `reset_ingestion_staging()` itself
  yet — the next swap cycle would hit the same gap. Flagged, not fixed.
- Does not proceed to retention policy or classification pipeline
  redesign, per ChatGPT's explicit instruction to stop here.
- Does not drop `_old` tables — retained per instruction, pending the
  Old Table Lifecycle Policy checklist (one more successful ingestion
  cycle + sustained reader verification + no anomaly).

## Next

Report to ChatGPT with this evidence. Flag the anon-grant gap as a
needed follow-up fix to `reset_ingestion_staging()` before it's relied
upon unattended. Await instruction on next steps — explicitly not
retention or classification redesign per this pass's own scope.
