# Identity Schema Design (Fasa 1A) — v1.1

v1.1: incorporates ChatGPT's audit of v1 — three additions (§5 lifecycle
dependency label, §7 Selective stays reader-defined not hard-coded, §9 new
P-006) plus one clarification (§7 Discard semantics). No structural
changes to v1's tables/constraints.

Status: schema DESIGN document only, per ChatGPT (director) instruction —
no tables, no Supabase Auth, no migration yet. Follows
`docs/identity-personal-layer-audit.md` (PASS) and locks in the concrete
shape for review before `db/schema.sql` gets a second migration.

Locked decisions this document builds on (per ChatGPT + Izzat, 2026-08-11):
- **L-050** — reader chooses Transfer / Discard / Selective at login; no
  system default.
- **L-051** — SavedStory and HistoryEntry share ONE admin-configurable
  retention duration (`PERSONAL_RETENTION_DAYS`), independent of Stream A's
  own `expires_at`/`review_expires_at` queue clocks.
- **L-052** — expiry must be visible to the reader (UI notice), not silent
  housekeeping.

---

## 1. Auth ownership

**Use Supabase Auth directly. Do not build a custom password/auth system.**

```
auth.users (Supabase-managed)
      ↓
  user_id (uuid, FK)
      ↓
saved_stories / history_entries
```

No separate `public.users` profile table is introduced by this document —
Quick has no profile fields (no display name, avatar, bio) to justify one
yet. `saved_stories.user_id` and `history_entries.user_id` reference
`auth.users.id` directly. If a profile table becomes necessary later
(e.g. per-user Active Set capacity override), that's a separate additive
decision, not assumed here.

---

## 2. `saved_stories`

```
saved_stories
├── id              uuid, PK
├── user_id         uuid, FK -> auth.users.id, NOT NULL
├── story_id        FK -> story_clusters.id, NOT NULL
├── saved_at        timestamptz, NOT NULL, default now()
└── expires_at      timestamptz, NOT NULL   -- saved_at + PERSONAL_RETENTION_DAYS at insert time
```

- **`UNIQUE(user_id, story_id)`** — a user cannot save the same story
  twice. A repeat "save" action on an already-saved story updates
  `saved_at`/`expires_at` (re-saves the retention clock) rather than
  inserting a duplicate row — upsert semantics, not insert-or-fail.
- **`expires_at` is computed once at insert/update time**, not derived at
  read time from a live config value. Per ChatGPT: if Izzat later changes
  `PERSONAL_RETENTION_DAYS` from 30 to 14, existing rows keep their
  already-computed `expires_at` — no retroactive change to data the reader
  was already told about. This is also what makes L-052's UI notice
  trustworthy: the expiry date shown to a reader at save-time stays true.
- References `story_clusters.id`, never `rss_items.id` — per the audit's
  Object Mapping (§A), because the reader saves the STORY, not one
  language's report of it.

---

## 3. `history_entries`

```
history_entries
├── id              uuid, PK
├── user_id         uuid, FK -> auth.users.id, NOT NULL
├── story_id        FK -> story_clusters.id, NOT NULL
├── released_at     timestamptz, NOT NULL, default now()
└── expires_at      timestamptz, NOT NULL   -- released_at + PERSONAL_RETENTION_DAYS at insert time
```

- **No `UNIQUE(user_id, story_id)`.** History is an event log, not current
  state — a story can be released, become eligible again later (per
  Stream A's own queue rules), and get released again within one
  retention window, producing multiple `history_entries` rows for the
  same `(user_id, story_id)` pair. This mirrors the reasoning ChatGPT gave:
  History records what happened, not a single current fact.
- Same `expires_at`-computed-at-insert-time rule as `saved_stories`, same
  `PERSONAL_RETENTION_DAYS` source value (L-051 — shared duration).

---

## 4. `PERSONAL_RETENTION_DAYS` — where it lives

Not decided as a specific number here (per the audit — Izzat sets this as
admin). Implementation note for the eventual migration: this is a single
config value, not a column repeated per row. Candidates for where it lives
(to settle at implementation time, not now):
- an application-level constant/env var read by the insert/update code
  path that computes `expires_at`, or
- a single-row Postgres settings table if it needs to be adjustable
  without a redeploy.
Either way, only ONE value drives both tables (L-051) — no per-story or
per-user override in this design.

---

## 5. Foreign keys and cascade behavior

```
saved_stories.user_id   -> auth.users.id      ON DELETE CASCADE
saved_stories.story_id  -> story_clusters.id  ON DELETE RESTRICT (see below)

history_entries.user_id  -> auth.users.id      ON DELETE CASCADE
history_entries.story_id -> story_clusters.id  ON DELETE RESTRICT (see below)
```

- **`user_id` cascades on delete** — if a Supabase Auth user is deleted
  (account deletion), their SavedStory/HistoryEntry rows are deleted with
  them. Personal data has no reason to outlive its owner.
- **`story_id` does NOT cascade** — per the audit's Invariant 4 (personal
  expiry cannot delete a Story Cluster) and its inverse: a Story Cluster
  being cleaned up must not silently orphan/corrupt personal rows either.
  Per Izzat's correction (audit §Expiry), there is no "keep the story
  alive for reference integrity" requirement to design around — Stream A's
  own queue/review expiry and the personal retention clock are decoupled
  and run independently. `ON DELETE RESTRICT` is a placeholder here
  flagging that Stream A's own story-cluster cleanup job (not yet built)
  needs to decide its own behavior when personal rows still reference a
  row it wants to remove — out of scope for this document, tracked as a
  Stream A follow-up alongside the incremental-ingestion hardening already
  noted in `docs/supabase-project.md`.

  **[OPEN, per ChatGPT audit] Labeled explicitly as a lifecycle
  dependency, not settled here:** whatever Stream A's story-cluster
  cleanup job ends up doing must be decided WITH awareness that
  `saved_stories`/`history_entries` may hold live references at that
  moment — `ON DELETE RESTRICT` above is a safe placeholder (it fails
  loud rather than silently corrupting data) but is not the final answer;
  the real cleanup-job design needs to consult this document when built.

---

## 6. RLS policy matrix

Principle, per ChatGPT: `service_role` (server-side ingestion, already in
use for Stream A) always bypasses RLS by design — these policies govern
the `authenticated`/`anon` API roles a browser client would use.

| Table | Operation | Own rows | Other users' rows |
|---|---|---|---|
| `saved_stories` | SELECT | ✓ | ✗ |
| `saved_stories` | INSERT | ✓ (as self only — `user_id = auth.uid()`) | ✗ |
| `saved_stories` | UPDATE | ✓ | ✗ |
| `saved_stories` | DELETE | ✓ | ✗ |
| `history_entries` | SELECT | ✓ | ✗ |
| `history_entries` | INSERT | ✓ (as self only) | ✗ |
| `history_entries` | UPDATE | — (events are immutable once written; no UPDATE policy) | ✗ |
| `history_entries` | DELETE | ✓ (a user can clear their own history early) | ✗ |

This directly implements P-005 (Personal state isolation, ChatGPT's
proposed invariant from the audit) at the database layer, not just as an
application-level assumption. Exact policy SQL is implementation, not
decided in this document — this table is the contract the SQL must
satisfy.

**[PROPOSAL, per ChatGPT audit] P-006 — Personal references are
non-authoritative.** `saved_stories` and `history_entries` must never
become a source of truth for Story Cluster state, Editorial Score, Ranked
Queue, or Active Set. Concretely: saving a story must never cause it to
rank higher, stay in the queue longer, get admitted to the Active Set, or
receive any editorial boost. This closes off a specific failure mode —
"Save" quietly turning into a hidden popularity/ranking signal — which
would violate Stream A's engine being deterministic and editorially
controlled, not reader-behavior-driven. Complements Invariant E.1
(`identity-personal-layer-audit.md`) by stating the same boundary from the
opposite direction (personal layer must not read back into Stream A,
not just that Stream A actions don't touch the personal layer).

`anon` role gets no policies on these two tables at all (matches Stream
A's existing deny-by-default posture) — anonymous readers have no
personal-layer rows to read in the first place.

---

## 7. Anonymous → Authenticated transition (L-050) — state mapping

Per L-050, the reader chooses at login. What "chooses" maps to concretely:

```
Anonymous session state
├── Active Set (current slots)
├── current language selection
├── current topic filter
├── (if pre-login History/Save existed client-side — see note below)

LOGIN
  ↓
Decision UI presents reader a choice
  ↓
├── Transfer    → eligible anonymous state carried into the new/existing account
├── Discard     → anonymous state dropped; account starts clean
└── Selective   → reader checks which categories to carry (e.g. ☑ Saved  ☑ History  ☐ Active Set)
```

**[REVISED, per ChatGPT audit] Selective stays fully reader-defined —
no hard-coded categories in this design.** An earlier draft of this
document proposed excluding Active Set from what Selective offers,
defaulting it to always rebuild fresh. That is withdrawn: per L-050, the
reader chooses, full stop — this document must not silently pre-narrow
what's choosable. Category grouping (e.g. whether Active Set appears as
its own checkbox, or is bundled, or is offered at all) is a UI-design
decision to make later, informed by Izzat, not something this schema
document decides on his behalf.

**[PROPOSAL, per ChatGPT audit — clarification] Discard semantics.**
"Discard" means the anonymous session's Save/History/Active
Set/language/topic state is dropped — it does NOT mean the login itself
is cancelled or fails. The reader still ends up logged in with a clean
account; only the pre-login state is discarded, not the login action.
Stated as PROPOSAL pending Izzat's confirmation, not LOCKED — flagged
here so "Discard" isn't later misread as "cancel login."

**Dependency flagged, not resolved here:** none of this is buildable until
anonymous session state has *some* persistence mechanism to survive up to
the login moment (currently proposed client-only per
`docs/identity-personal-layer-audit.md` §6 Session vs Identity — sufficient
for Active Set/language/topic, but if anonymous History/Save are ever
allowed pre-login, that reopens the client-only-vs-server question). This
document assumes anonymous History/Save do NOT exist pre-login (matches
current product scope — Save/History require being logged in), so
Transfer/Discard/Selective apply only to Active Set + language + topic
state, not to any anonymous personal-layer rows (there are none).

---

## 8. Non-goals of this document

Per ChatGPT's explicit instruction: this document produces zero SQL, zero
migration, zero Supabase Auth configuration, zero RLS policy code, zero
UI. It exists so the shape of `saved_stories`, `history_entries`, their
constraints, cascade behavior, and the RLS contract are reviewable before
`db/schema.sql` gets extended. Migration + RLS + Auth wiring are intended
(per ChatGPT) to land together as one small vertical slice once this
design is approved — not built piecemeal, and not started by this
document.
