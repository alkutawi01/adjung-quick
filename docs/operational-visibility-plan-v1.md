# Operational Visibility Plan v1 (2026-08-14)

Status: `[x] Plan` `[ ] Approved` `[ ] Implemented` — **no code yet**

FASA 4.1. Per ChatGPT: don't code yet. Answer what the admin needs to
know without opening the database, what existing data covers it, what's
genuinely missing, and scope three components — Editorial Activity
Timeline, System Health Snapshot, Admin Digest enhancement. No dashboard,
no reader analytics, no ranking changes. 4.2 does not start until this
lands, on purpose — Fasa 3's architecture decisions become the
*operational contract* this phase turns into something observable.

## What the admin needs to know without opening the database

Three genuinely different questions, per ChatGPT's own split — kept
separate below because they have different sources and different
urgency:

| Question | Category |
|---|---|
| "What did *people* (admins) do to the news today?" | Editorial activity |
| "Is the *system itself* working?" | Health monitoring |
| "What are *readers* doing?" | Reader behaviour — **explicitly out of scope this phase** |

## What existing data already covers

Grounded in the actual code, not assumed:

| Need | Source | Ready now? |
|---|---|---|
| Editorial actions today | `story_overrides` (`override_type`, `new_field`, `created_at`, `reason`) | Yes |
| A pin/hide/boost that has **expired** | `expires_at` — a row past this timestamp is known to have stopped applying, at that exact time | Yes, derivable |
| "Perlu perhatian" count + trend basis | `fetchReviewQueue()` (already the Digest's own source — reused, not re-derived) | Yes |
| Source liveness, RSS failures, classification success rate | `db/daily-observation.mjs`'s `gatherMetrics()` — already computes exactly this | **CLI only** — same constraint the Admin Digest plan already documented: it authenticates with the service-role key, which must never reach the browser |
| Ranking pilot stability | `db/daily-observation.mjs` again (`editorial_v1` overlap tracking) | CLI only, same reason |

## What's genuinely missing — found by checking, not assumed

**`deactivated_at` does not exist.** Checked directly:
`db/schema-editorial-state.sql` and every later migration — `story_
overrides` has `created_at` and `expires_at`, nothing recording *when*
an admin manually deactivated a row via `deactivateOverride()`. That
function only flips `active → false`.

This matters because ChatGPT's own timeline example includes both kinds
of lifecycle event:
- **"Pin berita Z tamat tempoh" (expired)** — needs no new column.
  `expires_at` already says exactly when this happens.
- **"Admin sembunyikan berita Y" then later un-hides it manually** — the
  *creation* is already timestamped (`created_at`), but a manual
  *reversal* currently leaves no trace of when. The timeline could show
  the row went inactive, never when.

**Consequence for scope**: 4.1.1 (Timeline) can ship fully correct for
every override's *creation* and *natural expiry* today, with zero schema
change. Manual deactivation timing is a real gap — recorded here, not
silently patched around, and not blocking the rest of this phase.

**The CLI/browser split (from the Admin Digest plan) applies here too**,
more sharply: System Health Snapshot's most valuable content (source
liveness, RSS failure counts) lives entirely in service-role-only
scripts. This phase cannot "just read" that data into the browser — it
needs a real decision, not assumed away.

## Component scope

### 4.1.1 — Editorial Activity Timeline
*"What happened to the news today?"*

Query: `story_overrides` for the edition, ordered by `created_at` desc,
translated to the same human-first sentences the Digest already uses
(`fetchDigest()`'s `summariseActions()` — reused pattern, not a new
translation layer). Each row: time, plain-Malay description, which
story. Expired rows shown once, computed at read time
(`now() > expires_at`), not via a new "expired" event type.

**Out of scope for 4.1.1**: manual-deactivation timing (see above — real
gap, not silently faked with `created_at`).

### 4.1.2 — System Health Snapshot
*"Is the system healthy?"*

**Decision needed before this can be scoped precisely**: `gatherMetrics()`'s
source/RSS/classification numbers require the service-role key. Two honest
options, not a false choice between "build it" and "don't":

- **(a)** A small, separate server-side endpoint (the first one this
  project would have — currently `db/*.mjs` are all CLI scripts with
  no HTTP surface) that runs `gatherMetrics()`-equivalent logic and
  returns a JSON summary the admin panel fetches. Real new
  infrastructure, not a config toggle.
- **(b)** `db/daily-observation.mjs` already writes to
  `db/observations/` (day-over-day history, per its own existing
  design). If those files were also written somewhere the anon-safe
  client could read (or summarised into a public-safe table), the
  Snapshot becomes a read of already-computed data, no new server
  surface needed.

Not decided here — flagged for ChatGPT, since it's a real architecture
choice this plan shouldn't make unilaterally.

**What's ready regardless of that decision**: Review Queue count and
active-override count both come from tables the anon-safe admin session
already reads — no blocker on those two numbers specifically.

### 4.1.3 — Admin Digest enhancement (trend context)
*"43 berita perlu perhatian" → "43 berita perlu perhatian (+5 berbanding semalam)"*

Not a rebuild, per ChatGPT. Needs yesterday's `processed`/`needsAttention`
counts to diff against today's. `fetchDigest()` currently computes only
today's numbers live — nowhere persists yesterday's for comparison.

**Smallest correct addition**: a tiny table (or reuse of
`db/observations/`'s existing day-over-day file pattern, if 4.1.2's
option (b) is chosen — the two would then share one mechanism instead of
inventing two) storing yesterday's digest numbers once, read back the
next day. Genuinely small; not a "new detection system" — the numbers
already exist, only their *retention* is new.

## What this plan does NOT do

- No dashboard — three focused answers to three focused questions, not
  one large surface
- No reader analytics/behaviour tracking
- No ranking change
- No implementation of 4.1.2's server-vs-read-existing-data decision —
  flagged, not resolved, pending ChatGPT
- No manual-deactivation timestamp added to the schema (the gap is
  named; whether it's worth a migration is a call for after 4.1.1 ships
  and someone actually notices the missing case)
- 4.2 does not start alongside this, per ChatGPT's explicit instruction

## Open question for ChatGPT

4.1.2's real architecture choice: a new server-side summary endpoint, or
routing `daily-observation.mjs`'s existing output somewhere the browser
can read. Recommend deciding before implementation starts, since it
determines whether this phase adds new infrastructure or reuses existing
output.
