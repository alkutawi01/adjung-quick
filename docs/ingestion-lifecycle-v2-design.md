# Ingestion Lifecycle v2 — Design (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Design document — Fasa 2.6** (added to the roadmap by
ChatGPT after `docs/ingestion-destructive-rebuild-finding.md`). No code
change here. Incremental ingestion is deliberately NOT implemented yet.

## Why v2 must exist

v1 (`db/ingest-production.js`) is a destructive rebuild: delete
everything, re-insert whatever the feeds carry right now. Two
consequences, both now documented and guarded:

1. **It breaks on first real reader data** — `saved_stories`/
   `history_entries` reference `story_clusters` with no ON DELETE
   action, so the rebuild's delete fails the moment one story is saved.
   (Guarded 2026-08-13: `evaluateDestructiveRebuildGuard`, tested, and
   ingestion now refuses with a clear message instead of an FK error.)
2. **The product has no memory** — the database only ever holds what
   feeds carry now (~10 items each). A story that leaves its publisher's
   feed vanishes from Adjung Quick on the next run.

The guard makes v1 safe to keep using **today** (zero readers). v2 is
what replaces it before readers exist.

## The questions v2 must answer (per ChatGPT)

### 1. What does "a new story" mean?

A cluster whose `clusterKey` has never been seen. Requires trusting
`clusterKey` stability across runs — same story fetched tomorrow must
produce the same key, or "new" is meaningless. The key today is the
normalized canonical URL, which is stable per publisher — this is the
right identity, but v2 must treat any future change to
`normalizeUrl()` as a breaking migration, not a tweak.

### 2. What does "an existing story" mean?

A fetched cluster whose key already exists in the DB. v2 behaviour:
**update, never replace** — new members merge in (a story gaining a
second source is an update, not a new story), scores recompute, but the
row and its identity persist. This is what makes reader references and
editorial overrides survive.

### 3. When is a story archived?

The question v1 never had to ask, because it deleted everything. v2
needs an explicit state instead of silent disappearance:

```
active     — in current feeds, selectable for Active Sets
aged_out   — no longer in any feed; not selectable for NEW active sets,
             but still resolvable (saved stories, history, links)
```

`workspace_state` already has `'expired'` in its CHECK constraint —
likely the natural home rather than a new column, but that mapping is an
implementation decision.

Retention: content itself is short-lived (~1 week, per Izzat), but a
story referenced by any `saved_stories`/`history_entries` row must stay
resolvable for as long as that reference lives (reader data already
auto-expires per admin retention setting — the two lifecycles should be
linked: a story row is deletable only when nothing references it).

### 4. Can a cluster disappear?

Under v2: **never implicitly.** Only two explicit paths:
- retention cleanup, after (3)'s rule says nothing references it
- editorial `hide` (which is a visibility state, not a deletion —
  `docs/editorial-override-data-model-v1.md`)

### 5. How do overrides survive re-ingestion?

By construction: overrides live in their own table keyed by
`story_id`/`edition_id` (`docs/editorial-override-data-model-v1.md`,
core invariant *Generated Data ≠ Editorial State*), and v2 never deletes
clusters — so the reference an override points at keeps existing. Under
v1, an override would survive the truncate of
`edition_story_classifications` but could dangle if the cluster itself
vanished; v2 closes that hole.

## What stays true in v2

- `sources` and `rss_items` remain regenerable (no human state attaches
  to them directly) — though deleting `rss_items` must respect cluster
  representative references
- Classification stays a full recompute (`edition_story_classifications`
  truncate is fine — that table is machine-owned)
- The write guard and destructive-rebuild guard remain

## Sequencing

Per the roadmap: design now (this document), implement when Editorial
Operations MVP (Fasa 3) makes it necessary — i.e. **before** the first
real reader, since Trigger B firing means v1 can no longer run at all.
The day `npm run observe` shows Trigger B, this document stops being
optional.
