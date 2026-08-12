# Production Data Model Audit

Status: audit/mapping document, per ChatGPT (director) instruction —
"petakan dahulu, jangan terus `CREATE TABLE`." No SQL schema is finalized
here; this is the reasoning that a schema gets written FROM. One genuine
open question was surfaced while doing this (see §Open Question below) and
is NOT resolved unilaterally in this document — it needs a decision.

For each engine object: **Postgres entity** (or "no separate table — derived/query"),
**ownership**, **lifecycle**, **expiry**, **relationships**, **indexes**.

---

## 1. Source Registry

- **Entity:** `sources` table.
- **Ownership:** admin-configured (Izzat maintains; L-030 Configurable Source Registry).
- **Lifecycle:** active ⇄ inactive (L-031 Source failure isolation — Bernama's
  404 tonight is the real-world case this exists for). Replaceable without
  touching engine code (L-032).
- **Expiry:** none — persists until deactivated/replaced.
- **Relationships:** referenced by `rss_items.source_id`.
- **Indexes:** PK `id`; index on `(language, coverage)` for the
  Representation Selector's scope-preference lookup (`representation.js`).

## 2. RSS Item

- **Entity:** `rss_items` table.
- **Ownership:** system (ingestion pipeline writes, nothing else does).
- **Lifecycle:** fetched → sanitised → matched into a `story_clusters` row
  (Tier-0/Tier-1, `engine.js: dedupeAndCluster`).
- **Expiry:** tied to its cluster's lifecycle (§3) — an RSS item has no
  independent expiry; when its cluster expires, it goes with it. Consistent
  with "Quick is working memory, not an archive."
- **Relationships:** belongs to one `sources` row; belongs to one
  `story_clusters` row.
- **Indexes:** `source_id`; `cluster_id`; `normalized_url` and `(source_id, rss_guid)`
  — these two ARE the Tier-0 exact-match dedup lookup, must be indexed for
  ingestion-time lookups to stay cheap at volume.

## 3. Story Cluster

- **Entity:** `story_clusters` table.
- **Ownership:** system (created/updated by clustering step).
- **Lifecycle:** created on first RSS item; grows as more `rss_items` join
  (cross-source count increases → Editorial Score increases, §4). The
  **representative/canonical item is assigned once and never reassigned**
  — this is a locked principle from tonight's engine work (representative-only
  matching, no transitive drift) and MUST hold in the schema too, not just
  in `lab/engine.js`'s in-memory version.
- **Expiry:** `expires_at`, per L-025 (Queue expiry) — a cluster sitting in
  the queue unselected doesn't last forever. Distinct from L-026 Review
  expiry (§10) — different expiry clock for a different workspace_state.
- **Relationships:** has many `rss_items`; has zero-or-one row in
  `active_set_slots`, `editorial_control`, `history_entries`.
- **Indexes:** PK `id` (= `clusterKey` today); `workspace_state`; `editorial_score DESC`
  (this is what "Ranked Queue" queries against — see §6).

## 4. Editorial Score

- **Entity:** NOT a separate table — columns on `story_clusters`
  (`freshness_score`, `cross_source_score`, `prominence_score`, `editorial_score`).
- **Ownership:** system-computed, on-write (per Gemini's original proposal,
  confirmed still correct).
- **Lifecycle:** recomputed whenever cluster membership changes (new
  `rss_items` joins → `cross_source_score` changes) or on a freshness-decay
  schedule. The aging-boost formula (Grok's proposal, threshold/weights
  still CONFIG not LOCKED) is on-read, so it is NOT a stored column — it's
  computed at query time from `editorial_score` + `NOW() - created_at`.
- **Expiry:** n/a — lives with the cluster.
- **Relationships:** n/a (it's columns, not rows).
- **Indexes:** covered by `story_clusters.editorial_score DESC` above.

## 5. Representation

- **Entity:** NOT a separate table. A "representation" is simply an
  `rss_items` row viewed as a member of its `story_clusters` row, filtered
  by language. `representation.js`'s Representation Selector is a query
  (`SELECT * FROM rss_items WHERE cluster_id = ? AND language = ANY(?)`),
  not a persisted concept.
- **Relationships / Indexes:** covered by §2.

## 6. Ranked Queue

- **Entity:** NOT a table. A query: `story_clusters WHERE workspace_state = 'queued' ORDER BY editorial_score DESC`.
- No lifecycle/expiry of its own — inherits from `story_clusters` (§3).

## 7. Active Set

- **Entity:** `active_set_slots` table (`owner_ref`, `slot`, `cluster_id`,
  `representation_rss_item_id`, `selection_reason`, `admitted_at`).
- **Ownership:** see **Open Question** below — `owner_ref` needs to identify
  either an anonymous session or a logged-in user, and that identity model
  isn't settled yet.
- **Lifecycle:** L-013/L-014 (existing items immutable, open-slot-only
  filling) — a row is only ever inserted (new admission) or deleted
  (release), NEVER updated in place to point at a different cluster. This
  is the single most important invariant carried over from `state/reducer.js`
  into the schema; violating it here would silently undo tonight's work.
- **Expiry:** none directly — a slot's occupant changes only via
  RELEASE_STORY or SWITCH_LANGUAGE (both explicit user actions), never a
  time-based expiry of the slot itself.
- **Relationships:** FK to `story_clusters`; FK to `rss_items` (which
  representation is showing); FK to `owner_ref`.
- **Indexes:** `(owner_ref, slot)` unique; `cluster_id` (for "is this cluster
  currently in someone's Active Set" checks).

## 8. Editorial Control (Pin / Prioritize / Remove)

- **Entity:** `editorial_control` table (`cluster_id`, `action`, `created_at`,
  `fulfilled_at` nullable).
- **Ownership:** single editor (Izzat) — L-022 No complex admin dashboard,
  no role/permission system needed for v1. Can be a fixed admin identity,
  not a full user FK.
- **Lifecycle:** `PIN`/`PRIORITIZE` persist until explicitly cleared or
  (for Pin) fulfilled — `fulfilled_at` gets set the moment
  `selectActiveSetWithControl` admits it (§9). `REMOVE` persists until
  explicitly un-removed.
- **Expiry:** none specified yet — an open question for later, not urgent
  (single editor, low volume of overrides expected).
- **Relationships:** FK to `story_clusters`.
- **Indexes:** `cluster_id`; partial index on `action = 'PIN' AND fulfilled_at IS NULL`
  (this literally IS the Pin-Pending Queue, §9 — no separate storage needed).

## 9. Pin-Pending Queue

- **Entity:** NOT a separate table — a query over `editorial_control`
  (`WHERE action = 'PIN' AND fulfilled_at IS NULL ORDER BY created_at ASC`).
  Grok's FIFO design falls out of `ORDER BY created_at` for free.

## 10. Review Queue

- **Entity:** NOT a separate table — `story_clusters.workspace_state = 'review'`,
  with its own `review_expires_at` column distinct from the general
  `expires_at` (§3), because L-025 (Queue expiry) and L-026 (Review expiry)
  are explicitly two different clocks per tonight's original session.
- Everything else (ownership, relationships) inherits from §3.

## 11. History (L-045)

- **Entity:** `history_entries` table (`user_id`, `cluster_id`, `released_at`, `expires_at`).
- **Ownership:** logged-in user ONLY — L-043 explicitly lists "mendapatkan
  semula berita yang pernah diswipe/dibuang" as one of the functions that
  requires login. `user_id` is NOT NULL here (unlike Active Set, §7).
- **Lifecycle:** created by `RELEASE_STORY` (already prototyped as an
  in-memory array in `state/reducer.js` tonight — this is that placeholder's
  real destination). Read-only after creation except for expiry.
- **Expiry:** `expires_at` — exact retention window still OPEN (per L-044/L-045,
  "tempoh expiry masih OPEN").
- **Relationships:** FK to `users`; FK to `story_clusters`.
- **Indexes:** `(user_id, released_at DESC)` for the "search within retention
  window" use case Izzat described.

## 12. Saved Story (L-044)

- **Entity:** `saved_stories` table (`user_id`, `cluster_id`, `saved_at`, `expires_at`).
- Same ownership/expiry shape as History (§11) — logged-in only, has expiry,
  is a reference not a content copy (per L-044 "Save bukan salinan berita").
- **Relationships:** FK to `users`; FK to `story_clusters`.
- **Indexes:** `(user_id, saved_at DESC)`.

## 13. User

- **Entity:** `users` table.
- **Ownership:** self (the reader).
- **Lifecycle / auth mechanism:** explicitly NOT decided — Fasa 1A's job.
  This audit only asserts that `saved_stories.user_id` and
  `history_entries.user_id` need SOMETHING to point at; it does not decide
  what `users` contains or how identity is established.
- **Relationships:** referenced by `saved_stories`, `history_entries`, and
  possibly `active_set_slots.owner_ref` (see Open Question).

---

## Open Question — Active Set ownership for anonymous readers

L-043 locks that Quick is fully readable anonymously, and that Active Set
behaviour (§7) must stay consistent per ChatGPT's earlier persistence
principle ("kalau user buka Quick pada device lain, behaviour perlu
konsisten" — but that principle was stated in the context of a LOGGED-IN
user). For an anonymous reader there is no `user_id` to key
`active_set_slots.owner_ref` on.

Two options, NOT decided here:

- **A. Session/device-scoped Active Set** — `owner_ref` is an anonymous
  session token (cookie/localStorage id), persisted server-side keyed to
  that token. Survives a page reload, does NOT survive a new device/browser
  (consistent with "login only needed for state that needs to survive
  across sessions/devices" — L-043's own wording).
- **B. Client-only Active Set for anonymous readers** — no server row at
  all until/unless the reader logs in; `owner_ref` is simply absent, and the
  whole Active Set lives in browser state until a session starts.

This doesn't block Stream A (Engine Production) — RSS ingestion, clustering,
scoring, and the Ranked Queue itself have no dependency on this decision.
It only blocks finalizing the `active_set_slots` table shape, which can
wait for Stream B / Fasa 1A without stalling Stream A.
