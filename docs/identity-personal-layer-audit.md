# Identity / Personal Layer Audit (Fasa 1A)

Status: audit/contract document only, per ChatGPT (director) instruction —
frame and audit first, implement after. **Nothing here is implemented.**
No Supabase Auth, login page, OAuth, password flow, RLS, `users` table,
`saved_stories` table, `history_entries` table, or anonymous session
persistence exists yet. This document exists so Izzat can review decisions
before any of that gets built.

Scope, per ChatGPT: four things only — Reader Identity, Saved Stories,
History, Expiry/Retention. Not a full login UI.

---

## A. Object Mapping

### User
- Represents an authenticated reader. Does NOT represent an anonymous
  visitor — see §F/§6 (Session vs Identity) for why that distinction matters.
- Conceptual fields: `identity` (auth mechanism TBD — Fasa 1A implementation
  step, not decided here).

### SavedStory
```
SavedStory
├── user_id
├── story_id      -- NOT rss_item_id — see rationale below
├── saved_at
└── expires_at
```
**Why `story_id`, not `rss_item_id`:** a story can have Malay/English/Arabic
representations (per the locked Story → Representation → Active Set model
from tonight's language mechanism work). The user saves the STORY, not one
language's report of it. When they reopen a saved story later, Quick picks
whichever representation matches their CURRENT language context at that
moment — consistent with how the Active Set already does this, not a new
rule invented for Save.

### HistoryEntry
```
HistoryEntry
├── user_id
├── story_id
├── released_at
└── expires_at
```
History is not an archive — it's a record of the reader's own working
memory (what they've already looked at and moved on from). Entries are
allowed to disappear after expiry; nothing here promises permanence.

---

## B. Ownership

| Object | Owner |
|---|---|
| `sources`, `story_clusters`, `rss_items` (Stream A, already built) | System — no per-user ownership, ever. |
| `SavedStory` | The authenticated user who saved it. |
| `HistoryEntry` | The authenticated user who released the story. |
| Anonymous reading state (current Active Set, current language, current topic filter) | The **session**, not a user — see §6. |

This split matters: Stream A's engine objects are global/shared. Personal
Layer objects are always scoped to exactly one user. There is no object in
this system that is jointly owned by two users (no sharing, no
collaboration — consistent with Quick being single-reader-per-account, not
a social product).

**Correction (per ChatGPT audit):** "session-owned" above is a conceptual
ownership label, not a decision about persistence mechanism. It does not
imply a server-side session table — the current default proposal for
anonymous Active Set is client-only. Ownership model and storage mechanism
are two separate questions; this document only settles the former.

---

## C. Lifecycle

```
anonymous
   ↓ (reads Quick, no account needed)
login                                    -- optional, only for personal functions
   ↓
save (SavedStory created)  OR  release (HistoryEntry created)
   ↓
expire (expires_at passed — entry becomes ineligible for retrieval)
   ↓
delete (actual row removal — see note below)
```

**Note on expire vs delete:** `expires_at` passing doesn't have to mean
instant physical deletion. It's fine (and arguably safer) for an expired
row to simply stop being returned by queries, with actual deletion handled
by a periodic cleanup job — this is an implementation detail for Fasa 1A's
build step, not decided here, but worth flagging so "expire" isn't assumed
to mean "synchronous DELETE at the exact expiry timestamp."

---

## D. Relationships

```
user
  ↓ 1-to-many
saved_story
  ↓ many-to-1
story_cluster
```

```
user
  ↓ 1-to-many
history_entry
  ↓ many-to-1
story_cluster
```

Both `saved_story` and `history_entry` reference `story_clusters.id` (the
Stream A object, already real in Supabase). Neither creates a NEW
representation of the story — they only reference the existing cluster.
This means Personal Layer tables can be added later WITHOUT modifying
`story_clusters` or `rss_items` at all — pure additive schema change.

---

## E. Invariants

These are the rules Fasa 1A implementation must not violate, mirroring the
discipline already enforced in `state/reducer.js` for Stream A:

1. **Save does not change the Active Set.** Saving a story is an
   observation/decision about personal retrieval, not a signal that
   changes what's currently occupying a slot.
2. **History does not change the Queue.** A story moving into History (on
   release) doesn't affect `story_clusters.workspace_state` or the Ranked
   Queue — those are Stream A concerns, entirely separate.
3. **Login does not change the Editorial Score.** Authentication is an
   identity event, not an editorial signal. No score column should ever
   read `auth.uid()` or similar.
4. **Personal expiry cannot delete a Story Cluster.** A `SavedStory` or
   `HistoryEntry` expiring only removes THAT reference row — it must never
   cascade into deleting the underlying `story_clusters`/`rss_items` rows,
   which may still be referenced by other users' saves/history, or still
   be live in the Ranked Queue.

Structurally, these hold today because `saved_story`/`history_entry` are
purely additive foreign-key references — there is no code path (once built)
that would need to reach back and mutate `story_clusters` for a personal
action to make sense. Worth a regression test once implemented, same as
Stream A's `existingActiveSet` immutability tests.

5. **[PROPOSAL, per ChatGPT audit] P-005 — Personal state isolation.** One
   user's operations on their own SavedStory/HistoryEntry rows must never
   affect another user's personal state. Obvious as a statement, but it's
   the invariant that RLS policies (§6, not yet designed) exist to enforce
   — worth stating explicitly here so the eventual RLS design has a named
   requirement to satisfy, not just "seems right."

---

## F. Anonymous → Authenticated Transition

**RESOLVED by Izzat, 2026-08-11.**

Decision: **the reader chooses at login time** — not a fixed system
default. Login flow must present the choice explicitly (Transfer /
Discard / Selective — whichever options the UI offers), rather than the
system silently picking one on the reader's behalf. This overrides
ChatGPT's proposed "Selective Transfer as default" lean — Izzat's
instruction was to let the user pick, not to bake in one default.

Implementation consequence (not yet built, Fasa 1A scope): the login flow
needs a decision point UI, and pre-login anonymous activity needs to be
trackable long enough to survive to that choice — which still depends on
how anonymous session state is persisted (§ Session vs Identity below).
This is now an implementation detail to design in Fasa 1A, not an open
product question.

---

## Session vs Identity (explicit distinction, per ChatGPT)

```
Browser session  ≠  User identity
```

- **Anonymous reader** may have a session (current Active Set, current
  language selection, current topic filter) WITHOUT ever having an account.
  This is UI state, not personal-layer data — no `user_id` involved.
- **Authenticated reader** has identity (`user_id`) AND may still have
  session-scoped UI state layered on top.

Why this matters concretely: it's the reason `active_set_slots.owner_ref`
(flagged OPEN in `docs/production-data-model-audit.md`) shouldn't be
resolved by reaching for a `user_id` as a quick fix. An anonymous session
identifier and a `users.id` are different kinds of things with different
lifetimes, and conflating them was exactly the kind of "assume it before
the questions are actually answered" mistake tonight's whole process has
been trying to avoid.

---

## Expiry — explicitly NOT set to arbitrary numbers here

Per ChatGPT: don't jump to "7 days / 30 days / 90 days" without a basis.
What IS established: there are at least **four independent expiry clocks**,
not one universal expiry:

| Object | Expiry clock | Status |
|---|---|---|
| RSS item / Story cluster (queue) | `expires_at` (L-025) | Column exists in Stream A schema; exact duration still OPEN. |
| Story cluster (review) | `review_expires_at` (L-026) | Column exists in Stream A schema; separate clock from queue expiry, exact duration still OPEN. |
| SavedStory | `expires_at` | Not yet built; duration OPEN. |
| HistoryEntry | `expires_at` | Not yet built; duration OPEN. |

None of these four should be assumed equal to each other. A saved story
plausibly should outlive a queue item by a lot (days/weeks vs hours) but
that's a product judgment call for Izzat, not something to default silently.

**RESOLVED by Izzat, 2026-08-11 — corrects a framing error in ChatGPT's
question.** ChatGPT's question assumed a "story gets deleted while a
personal reference is still alive" dilemma, framed around "articles."
Izzat's correction: there are no articles in Quick — only headline + brief
(consistent with [[project_adjung_no_ai_strategy]] and the zero-image,
RSS-only product). The actual model is simpler than the dilemma implied:

- **Everything saved (SavedStory, HistoryEntry) auto-expires** on a single
  admin-configurable retention period (Izzat sets the duration as admin —
  not per-story, not four separate tunable durations as speculated
  earlier in this document's Expiry table; simplify to one setting unless
  a real reason emerges to split it).
- **The UI must show an upfront notice** that saved items will be deleted
  after that period, so a reader is never surprised — deletion is
  disclosed and expected, not a bug.
- **No cascade-delete dilemma exists**, because there is no separate
  "keep the story alive for reference integrity" requirement to satisfy —
  the personal reference and the underlying `story_clusters` row can both
  simply expire on their own schedules; there is nothing worth engineering
  around here.
- **Motivation, explicitly stated by Izzat: database cost savings** — this
  is a deliberate cost-control decision, not an oversight to patch later.

This replaces the earlier "four independent expiry clocks, all OPEN"
framing below with: one admin-configurable retention setting for personal
data (SavedStory/HistoryEntry), decoupled from whatever Stream A's own
queue/review expiry columns do — no dependency between them needs solving.

---

## What this audit deliberately does NOT do

Per ChatGPT's explicit "jangan bina" list — this document produces zero
code, zero SQL, zero UI. It exists purely so the shape and the open
questions (§F transition behaviour, all four expiry durations,
`active_set_slots.owner_ref` per the Session vs Identity distinction) are
visible to Izzat before any implementation work starts.
