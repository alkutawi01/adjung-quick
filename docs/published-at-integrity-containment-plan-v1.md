# published_at Integrity — Containment Plan v1 (2026-08-16)

Status: `[x] Plan` `[ ] Approved` — **design/audit only, no code yet**

FASA 4.2/4.3 (dependency correction, follow-up to
`docs/rss-kpm-published-date-resolution-audit-v1.md`), per ChatGPT's
instruction: `rss-kpm`'s publish date is confirmed NOT RECOVERABLE.
Before writing any code, this document maps every real place
`published_at` is actually used (not assumed), and compares three
containment options by their **real blast radius against the current
codebase** — not in the abstract.

Locked principle, stated by ChatGPT and restated here as the
constraint every option must satisfy: **unknown publication date ≠
publication date = fetch time.** No option below may represent an
unknown date as if it were a real one (not fetch time, not epoch, not
any other synthetic stand-in).

## 1. Where `published_at` is actually used

Traced directly against the real codebase, not inferred:

### Ranking / clustering (the largest surface)
- `lab/engine.js:27` — `dedupeAndCluster` sorts all items ascending by
  `publishedAt` before clustering; the **first item processed becomes
  the cluster's canonical representative**, permanently.
- `lab/engine.js:49` — Tier-1 fuzzy match gates on a ≤48h time
  difference between a candidate and each cluster's canonical
  `publishedAt`.
- `lab/engine.js:81` — `scoreCluster`'s freshness sub-score (0–50 pts)
  is computed from `ageHours = now - canonical.publishedAt`.
- `lab/match.js:55` — the same 48h time-diff gate, for cross-cluster
  story-match suggestions.
- `ranking/candidate-scoring.mjs:39-43,67` — freshness is one additive
  term in the Active Set candidate score. **This one site is already
  NaN-guarded** (`Number.isNaN(hours)` → `0`, per a prior audit fix
  cited in its own comments) — a missing date degrades to lowest
  freshness rather than crashing, but silently.
- Six near-identical scripts independently re-derive the canonical
  `rss_items` row per cluster via
  `new Date(item.published_at) < new Date(existing.published_at)`:
  `db/classify-production.js:81`, `db/classification-observatory.mjs:74`,
  `ranking/benchmark-runner.mjs:49`, `ranking/shadow-runner.mjs:63`,
  `ranking/small-field-benchmark-runner.mjs:50`,
  `db/local-snapshot-loader.mjs:40`.

### Attention Layer (V2)
- `ui/src/admin/editorialAttentionAdapter.js:47-48` — the freshness
  gate itself: a null/unparseable date is excluded from the queue
  (handled, but silently — no error surfaced).
- `ui/src/admin/editorialAttentionAdapter.js:142-155` — re-derives the
  canonical publish time per story via the same min-pick pattern as
  above.

### Reader / display
- `ui/src/adapter/productionAdapter.js:113,128` — picks the
  reader-facing canonical representative by earliest `publishedAt`
  among a cluster's members — this is what an actual reader sees.
- `ui/src/components/StoryCard.jsx:4,131` — formats `publishedAt` for
  on-screen display only ("3 hours ago") — not a decision site.

### Admin
- `ui/src/admin/reviewQueueAdapter.js:108,123,116` — same canonical-pick
  pattern, then the Review Queue is sorted newest-first by this value.

### Schema
- `db/schema.sql:77` / `db/schema-ingestion-staging-functions-v1.sql:85`
  — **`published_at TIMESTAMPTZ NOT NULL`**. No row can be inserted
  today without a value.

### What happens today if a date is missing or unreliable, per site
Only `candidate-scoring.mjs`'s freshness term is explicitly guarded.
Every canonical-pick site (`dedupeAndCluster`, `productionAdapter.js`,
`reviewQueueAdapter.js`, the six duplicated scripts, and the Attention
adapter's own canonical resolution) uses a raw `new Date(x) < new
Date(y)` comparison with **no null handling** — `new Date(null)`
resolves to the Unix epoch (1970), which would make a null-dated item
silently win every "earliest" comparison and become canonical by
accident. The Tier-1 clustering gates (`engine.js:49`, `match.js:55`)
produce `NaN` on a bad date, which fails every numeric comparison —
an item with no reliable date silently never matches any cluster
instead of erroring.

## 2. Three containment options, compared on real blast radius

### Option A — Source exclusion
`rss-kpm` stops flowing into production until its timestamp can be
trusted. Concretely: set `status: 'disabled'` in `lab/sources.js`
(the exact mechanism already used for JAKIM's `'failed_tls'` state,
per that entry's own comment — a real, proven precedent, not a new
pattern) and/or exclude it in `db/ingest-production.js`.

- **Blast radius: zero.** No ranking/clustering/reader/admin/Attention
  code is touched — every site listed in §1 continues operating
  exactly as it does today, because the untrustworthy input simply
  never reaches any of them.
- **Real cost**: KPM's 193 currently-classified items (mostly
  Pendidikan) stop growing; existing rows remain in the DB (not
  deleted) but no new KPM content arrives. Pendidikan coverage would
  shrink to whatever other sources provide (today: effectively none
  else, per the field-distribution finding) until a working
  Pendidikan source is found or KPM's feed improves.

### Option B — Source-specific freshness quarantine
`rss-kpm` content keeps flowing and being classified normally; only
its `published_at` is prevented from influencing anything
freshness-dependent.

- **Blast radius: large, distributed.** Every site in §1's "ranking /
  clustering" and "Attention" groups would need to consult a
  per-source trust flag before using the date — that's at least 9
  distinct call sites (`engine.js` ×3, `match.js`, `candidate-scoring.mjs`,
  the Attention adapter ×2, plus however many of the 6 duplicated
  canonical-pick scripts actually run against production data rather
  than lab fixtures) each needing a new conditional, not one shared
  guard. Higher implementation surface than Option A, and each
  touched site is a fresh chance to introduce exactly the kind of
  silent bug this whole audit chain exists to catch.
- **Real benefit**: preserves KPM's real content (classification,
  reader visibility) while genuinely fixing the freshness distortion
  — the more complete answer, but not the smallest one.

### Option C — Model correction (nullable `published_at` + explicit `fetched_at`)
Make the schema honest: `published_at` becomes nullable, a new
`fetched_at` column (always populated, since we always know when we
fetched something) becomes the explicit "we saw this at time X"
field, and every consumer is updated to treat a null `published_at`
as a real "unknown," not silently substitute anything.

- **Blast radius: largest.** Requires: (1) a schema migration lifting
  `NOT NULL` and adding `fetched_at` — a real production DB change,
  the exact category this project already treats with the most
  caution (per this session's own FASA 4.2 migration discipline); (2)
  updating `ingest-production.js`'s insert; (3) null-safety fixes at
  **every unguarded site named in §1** — the canonical-pick comparisons
  (7+ sites) need an explicit "null sorts last, never wins as
  earliest" rule instead of accidentally epoch-fallback-winning, and
  the clustering time-diff gates need an explicit "can't compare,
  treat as no-match" rule instead of relying on `NaN` doing that by
  accident. This is the conceptually correct long-term data model, but
  it is not a small change, and rushing the null-safety work across
  7+ sites under time pressure is a real risk of introducing new bugs
  while fixing this one.

## 3. Recommendation

**Option A now, Option C later as a deliberate, separately-scoped
migration — not Option B.**

Reasoning: Option A is the only one of the three that touches zero
ranking/reader/Attention code, reuses an existing, already-proven
mechanism (the JAKIM `status: 'disabled'` precedent), and cannot
introduce a new bug anywhere, because nothing downstream changes at
all. It directly satisfies ChatGPT's own criterion — "paling kecil dan
paling jujur yang boleh dilaksanakan tanpa merosakkan ranking/reader."
Option B was considered and rejected as the *near-term* move
specifically because its blast radius (9+ distributed call sites, each
needing bespoke trust-flag logic) is larger than Option A's and larger
than justified by the benefit of keeping one source's content flowing
while its date problem is unresolved. Option C is very likely the
right *eventual* answer — a nullable `published_at` plus explicit
`fetched_at` is the honest long-term model this whole audit chain has
been pointing toward — but it deserves its own dedicated, carefully
sequenced implementation plan (schema migration discipline + 7+
call-site null-safety work, done deliberately, not as a rider on this
containment decision).

## What this document does NOT do

- No code, no migration, no source status change — this is the design
  comparison only
- Does not implement Option A (or any option) — a decision, not an
  action
- Does not re-run the Attention V2 production simulation — per
  ChatGPT's explicit instruction, that waits until containment is
  actually applied
- Does not address `rss-rtm-sukan` (separate, narrower issue) or the
  3 stale-ingestion RTM sources (separate backlog item) — kept apart
  per ChatGPT's explicit instruction not to merge these workstreams

## Next

Awaiting review/approval of Option A. If approved: disable `rss-kpm`
in `lab/sources.js` (matching the JAKIM precedent exactly), verify
`npm test` stays green, re-run the production Attention simulation
against clean data, and only then does the 2-item qualification audit
regain the meaning ChatGPT named it needs.
