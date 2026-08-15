# Admin Digest Trend Plan v1 (2026-08-15)

Status: `[x] Plan` `[x] Approved` `[x] Implemented` — commit `01f8ed1`

## Implementation note (2026-08-15)

ChatGPT approved with two conditions: pilihan (a) (all four metrics get
trend capability, not just the two the live Digest already showed), but
restricted to operational signals only — no new editorial computation.
Concretely, that meant `failedSourcesToday`/`activeOverridesToday` are
sourced from **today's** `operational_snapshots_public` row when it
exists (not computed live), while `reviewQueue`/`storiesProcessed` reuse
the values `fetchDigest()` already computes live. Verified live against
production: trend line rendered correctly (`748, -148 berbanding
semalam`), a delta of 0 correctly showed no suffix, and
failed-sources/active-overrides correctly stayed hidden since today's
snapshot hasn't been recorded yet. 14 suites, 0 failures.

FASA 4.1.3, chosen before 4.1.1 (Editorial Activity Timeline) per
ChatGPT: `operational_snapshots` just went live, and a trend diff is its
lowest-risk first real use — `today − yesterday` on data that already
exists, versus Timeline's much harder open questions (who did what, is
it still active, `deactivated_at` still doesn't exist). Validate the
read model here before building something that needs more from it.

## A real gap found and fixed before this plan was even written

While preparing this, checked whether `fetchDigest()` (which always
runs on the **authenticated** admin session) could actually read
`operational_snapshots_public` — it couldn't. The migration only
granted `SELECT` to `anon`; `authenticated` is a separate Postgres role
with no automatic inheritance. Fixed and verified live
(`db/schema-fix-operational-snapshots-authenticated-grant.sql`,
`information_schema.role_table_grants` now shows both roles). Named
here because this plan would otherwise have been designed against a
read path that didn't actually work yet.

## Data source — `operational_snapshots` only, no parallel query

Per ChatGPT's explicit instruction. `fetchDigest()` already computes
`processed`/`needsAttention` **live** by calling `fetchReviewQueue()` —
that stays exactly as it is; nothing about *today's* numbers changes.
The only addition is a second, small read: **yesterday's** row from
`operational_snapshots_public`, to diff against.

```js
// Sketch, not final code — one extra query, reusing the adminSupabase
// client fetchDigest() already has.
const { data: yesterday } = await supabase
  .from('operational_snapshots_public')
  .select('*')
  .eq('snapshot_date', yesterdayDateString)
  .maybeSingle();
```

No new table, no new detection logic — the same discipline the Digest
itself was already built under ("not a new detection engine").

## Metrics compared

All four columns the table already has, per ChatGPT's list:

| Metric | Today's source | Yesterday's source |
|---|---|---|
| Review queue | `fetchReviewQueue().length` (live) | `operational_snapshots_public.review_queue_count` |
| Failed sources | *(not currently in the live Digest — see note below)* | `operational_snapshots_public.failed_sources_count` |
| Processed stories | `edition_story_classifications` count (live, `fetchDigest`'s existing query) | `operational_snapshots_public.stories_processed` |
| Active overrides | *(not currently in the live Digest)* | `operational_snapshots_public.active_override_count` |

**Honest note**: the live Digest today shows `processed`, `needsAttention`,
`noActionNeeded`, and `actionsToday` — it has no live "failed sources" or
"active overrides" line yet. Trend can only diff what has a **today**
value to diff against. Two real choices, not decided here:
- (a) add today's failed-sources/active-overrides counts to the live
  Digest query too (small additions, same tables `operational_snapshots`
  already reads), so all four get trend lines, or
- (b) trend only `review_queue_count` and `stories_processed` for now,
  the two the Digest already shows

Recommend (a) — it's a small, same-shaped addition, and having some
metrics trend-capable and others not would be a confusing half-feature.
Flagged as a decision, not assumed.

## Human-language format

Per ChatGPT's explicit example — never a raw delta:

| Not this | This |
|---|---|
| `delta: +5` | "5 lebih banyak daripada semalam" |
| `delta: -3` | "3 kurang daripada semalam" |
| `delta: 0` | *(no line at all — see edge cases)* |

Direction word depends on whether more is good or bad news for that
specific metric (more `needsAttention` is worse; fewer `failedSources`
is better) — the sentence should read naturally either way, not just
plug a signed number into one template.

## Edge cases — named explicitly, per ChatGPT

| Case | Behaviour |
|---|---|
| No snapshot for yesterday exists (first day ever, or a gap in the daily-observation habit) | Show today's numbers **with no trend line at all** — never a fabricated "+0" or a broken comparison against missing data |
| Today is the very first snapshot ever recorded | Same as above — this is just the first-day case of the row above, not a separate one |
| A gap of more than one day (yesterday's row is missing, but an older one exists) | Do **not** silently compare against an older-than-yesterday row and call it "semalam" (yesterday) — that would be a lie by omission. Show no trend line, same as the missing-data case. `daily-observation.mjs` being run irregularly (a real, already-named risk in the Fasa 3 closure report) is exactly what this guards against. |

## What this plan does NOT do

- No parallel/duplicate query path — one small addition to
  `fetchDigest()`, reusing `operational_snapshots_public`
- No reader analytics
- No ranking change
- Does not decide (a) vs (b) above — flagged for approval
- No code written

## Next

Awaiting approval, including a decision on the failed-sources/active-
overrides live-Digest question above, before implementation starts.
