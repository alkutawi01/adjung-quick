# Operational Visibility — Data Contract v1 (2026-08-15)

Status: `[x] Contract` `[ ] Approved` `[ ] Implemented` — **no code yet**

FASA 4.1 implementation preparation. Per ChatGPT's decision: System
Health Snapshot reuses `daily-observation.mjs`'s existing output as its
metrics source — no new service-role endpoint. This contract answers:
what can reach the admin, what must stay internal, the exact projection
shape, how it relates to the Admin Digest, and confirms no service-role
key ever reaches the browser.

## Real finding, checked before writing this contract

**`db/observations/*.json` is local-filesystem-only.** Confirmed by
reading `daily-observation.mjs`: it calls `writeFileSync()` to
`db/observations/observation-YYYY-MM-DD.json` on whatever machine runs
the script. It is never uploaded anywhere network-reachable — no
Supabase table, no S3, nothing a browser could ever fetch.

ChatGPT's decision — "guna output daily-observation sebagai sumber
metrics" — is the right call and this contract follows it, but it isn't
quite as free as "just point the browser at existing output" implies.
**The actual gap Fasa 4.1 must close is narrower than a full endpoint,
but it is a real gap**: the script's already-computed projection needs
one new destination it doesn't have today — a place both the script
(service-role, CLI) and the browser (anon-safe) can reach, without
inventing an HTTP API.

**Resolution, consistent with "jangan bina endpoint, jangan tambah
schema migration dahulu"**: this contract *specifies* the mechanism
precisely — a single narrow table, written by the existing CLI script,
read through an anon-safe view — so that when 4.1 actually implements,
the migration is a known, reviewed quantity, not a decision made mid-code.
Naming it here satisfies "before coding, prepare the contract"; applying
it is implementation, not this document.

```
daily-observation.mjs (service-role, CLI, unchanged behaviour otherwise)
        │
        ▼
  writes ONE ROW (today's projection only, upsert by date)
        │
        ▼
  operational_snapshots table (new, small — id/date/payload jsonb)
        │
        ▼
  operational_snapshots_public VIEW (narrow projection, GRANT SELECT TO anon)
        │
        ▼
  Admin panel reads the view — same pattern as public_active_overrides
```

This is the SAME shape Fasa 3 already used twice (`public_active_
overrides`, and the Admin Digest's own reuse of `fetchReviewQueue()`) —
not a new architecture, the same one applied to a third data source.

## What CAN reach the admin

A **projection**, never the raw observation object — per ChatGPT's own
example. Concretely, from the real fields in
`db/observations/observation-2026-08-13.json` (the actual current file,
not a hypothetical):

| Field shown to admin | Source in the real observation JSON |
|---|---|
| `date` | `observedAt` (truncated to date) |
| `stories_processed` | `counts.clusters` |
| `sources_active` / `sources_total` | `counts.sourcesContributing` / `counts.sources` |
| `sources_failed` | `silentSources.length` (count only, not the list — see below) |
| Per-edition classified/unclassified | `editions.<id>.classified` / `.unclassified` |

## What MUST stay internal

| Withheld | Why |
|---|---|
| `silentSources` / `knownBrokenSources` (the actual source ID lists) | Internal registry identifiers (e.g. `rss-kosmo`), operational detail a reader/admin dashboard doesn't need named — a count is the useful signal, the list is debugging detail for whoever runs the CLI |
| `rankingPilots.*.selectedStoryIds` | Not secret (they're public story URLs), but it's the ranking engine's internal working set, not an "editorial activity" fact — showing it here would blur 4.1.1 (editorial activity) and 4.1.2 (health) together, the exact conflation ChatGPT's 3-question split (§ "What the admin needs to know") warned against |
| `editions.<id>.fields` (full per-Bidang breakdown) | Already visible elsewhere (the reader-facing Wheel itself shows this implicitly); repeating the full breakdown in the health snapshot adds noise without a new signal |
| Anything from `process.env` (Supabase keys, `SUPABASE_SERVICE_ROLE_KEY`) | Never touches this table at all — the CLI script computing the projection has it in its own process; the projection payload it writes never includes it |

## Projection format

Matches ChatGPT's own example shape exactly, populated from real fields:

```json
{
  "date": "2026-08-13",
  "stories_processed": 896,
  "sources": { "active": 43, "failed": 0 },
  "editions": {
    "ms-MY": { "classified": 737, "unclassified": 11 },
    "en-global": { "classified": 58, "unclassified": 40 },
    "ar-global": { "classified": 20, "unclassified": 31 }
  }
}
```

## Relationship with Admin Digest

**Not a merge, not a duplicate — two different questions, per ChatGPT's
own split**, reusing the SAME query-not-duplicate discipline the Digest
was already built under:

| | Source | Question |
|---|---|---|
| Admin Digest | `fetchReviewQueue()` (live query, Supabase, this session) | "What needs *my* attention *right now*?" |
| System Health Snapshot | `operational_snapshots_public` (yesterday's/today's batch projection) | "Is the *system* working, structurally?" |

4.1.3's trend enhancement (`+5 berbanding semalam`) is the actual bridge
between them: it reads **yesterday's** row from this same
`operational_snapshots` table to diff against **today's** live Digest
number. One new table serves both the Snapshot and the Digest's trend
line — not two mechanisms.

## No service-role key in browser — confirmed, not just asserted

The chain above never crosses that boundary:
- `daily-observation.mjs` keeps its existing service-role client,
  unchanged — it already runs this way today (`db/daily-observation.mjs`
  is a CLI script, confirmed in the Admin Digest plan's own investigation)
- The new write (`operational_snapshots`) is one more `INSERT`/`UPSERT`
  from that SAME already-privileged script — no new credential exposure
- The browser only ever queries `operational_snapshots_public`, a VIEW
  with `GRANT SELECT TO anon` (or `authenticated`, scoped to the admin
  surface) — same shape as `public_active_overrides`, which is already
  live and already verified (`401` on the base table, `200` on the view)

## Editorial Activity Timeline — real timestamps only

Per ChatGPT's explicit correction: **allowed** — "Pin dibuat pada 10:00
dan tamat pada 10:00 esok" (`created_at`, `expires_at` — both real
columns). **Not allowed** — "Admin membatalkan Pin pada 14:00"
(`deactivated_at` does not exist; inventing this sentence from `active`
flipping to `false` would fabricate a timestamp no data supports).

**Recorded as a future item, per ChatGPT's own suggestion, not built
now**: `Editorial Audit Metadata` — `deactivated_at`, `deactivated_by`,
`deactivation_reason` — becomes worth a real migration once more than
one admin exists and manual-reversal audit trail actually matters. Named
here so it isn't rediscovered as a surprise later.

## What this contract does NOT do

- No migration applied — `operational_snapshots` table/view specified,
  not created
- No endpoint built
- No change to `daily-observation.mjs`'s existing behaviour beyond
  adding one write at the end of its existing run
- No `deactivated_at` column added
- No implementation of 4.1.1/4.1.2/4.1.3's actual UI

## Next

Implementation, once this contract is reviewed — starting with the
`operational_snapshots` migration this document specifies, since every
other piece of 4.1 depends on that data existing somewhere reachable.
