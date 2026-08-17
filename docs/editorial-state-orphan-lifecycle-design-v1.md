# Editorial State Orphan Lifecycle — Design v1 (2026-08-17)

Status: `[x] Design` `[ ] Approved` — **no code written, no schema
migration, no cleanup mechanism built.**

Per ChatGPT's explicit instruction after the production ingestion swap
(2026-08-17) nearly failed on a real FK violation: `story_overrides`
referenced a `story_id` that the new ingestion generation didn't
reproduce. The 2 rows that actually caused it were confirmed test
residue and removed by hand — but the underlying question was never
answered: *what should happen, in general, when a story that editorial
state points at doesn't come back in a later ingestion generation?*
This document answers that, design-only, before any lifecycle code is
written.

## 0. The two kinds of state this project already has — restated precisely

```
INGESTION DATA                      EDITORIAL STATE
  story_clusters                      story_overrides
  rss_items                           saved_stories
      ↓                               history_entries
  regenerated every ingestion             ↓
  run — a NEW GENERATION can          created by a human (admin) or
  legitimately drop a story that      a reader action, independent
  a previous generation had           of any one ingestion run
```

This split already exists in the codebase's own words — the audit
(`docs/backend-single-source-of-truth-audit-v1.md`) and this project's
schema comments both say it. What's never been written down before is
what happens at the *boundary* between them.

## 1. A fact that changes the shape of this problem: every editorial-state row already self-expires

Checked directly against the schema (`db/schema-editorial-state.sql`,
`db/schema-identity.sql`) — this was not assumed, it was read:

| Table | Expiry column | Nullable? |
|---|---|---|
| `story_overrides` | `expires_at` | **`NOT NULL`** — schema comment: *"story-level overrides MUST expire (news has a ~1 week shelf life)"* |
| `saved_stories` | `expires_at` | `NOT NULL` |
| `history_entries` | `expires_at` | `NOT NULL` |

**This is the single most important fact in this design.** None of
these three tables were ever meant to live forever. Every row already
carries its own independent lifetime, set at creation time, that has
nothing to do with which ingestion generation is currently live. A
`hide` override created today with `expires_at` one week out doesn't
need ingestion to tell it when to stop mattering — it already knows.

This means the "orphan" problem is not "these tables need a NEW expiry
mechanism." It's narrower: **the hard database FK
(`story_id REFERENCES story_clusters(id)`) currently forces a row to
die at swap time if its story doesn't reappear — even if the row's own
`expires_at` says it should still be alive for another 6 days.** The FK
is enforcing a lifecycle rule ("this row dies when its story is gone
from the live table") that the schema's own `expires_at` column
already contradicts ("this row dies at a specific time I was given").
Two different lifecycle rules, silently in conflict, and the FK wins by
force (a hard constraint violation) rather than by design.

## 2. What "orphan" means for each table, precisely

**`story_overrides`**: a row whose `story_id` is not present in the
CURRENT live `story_clusters`. Per §1, this is not automatically "the
override is stale" — a `hide` created 2 days ago with `expires_at` 5
days out, on a story that a re-clustered generation happens not to
reproduce, is still a **live, meaningful admin decision** for its
remaining 5 days. Orphan ≠ expired. They are different conditions and
must not be conflated.

**`saved_stories`**: a row whose `story_id` is not present in the
current live `story_clusters`. This is a *reader's* decision, not an
admin's, but the same logic applies — a reader saved a story to read
later; the story briefly not being in the newest generation (a
same-day re-ingestion, a clustering nuance) doesn't mean the reader's
intent to read it later has expired. It has its own `expires_at` too.

**`history_entries`**: a row whose `story_id` is not present in the
current live `story_clusters`. Per its own schema comment, this is
"an event log" (deliberately no uniqueness constraint) — a record that
a reader released this story at a point in time. This is the
**least** consequential of the three to have orphaned, since it's
retrospective by nature (it records what already happened), not a
standing decision that governs current behavior. It still has
`expires_at`, so it still self-cleans.

## 3. Distinguishing *why* a story didn't reappear — does it matter?

ChatGPT asked this explicitly. Answer, grounded in what `lab/engine.js`
and `lab/rss.js` actually do (per the earlier backend audit):

| Cause | Detectable today? | Does it change how orphan state should be treated? |
|---|---|---|
| Story stopped being fetched (source removed it, expired off the RSS feed) | Yes — absence, indirectly | No — same outcome as any other "not in this generation" case |
| Clustering assigned it a **different** `id` (re-clustered differently run to run) | **No** — `lab/engine.js`'s clustering is deterministic per-run but not guaranteed to produce the same `clusterKey` for the same real-world story across separate runs if title-matching drifts | This is the dangerous case — the story didn't "leave," the SAME story now has a different orphaned-vs-new identity, and an admin's `hide` on the old id silently stops applying to what is, editorially, the same story |
| Story was merged into another cluster | No explicit merge operation exists in this codebase today (confirmed — `lab/engine.js` only creates clusters, never merges two existing ones post-creation) | N/A today, but worth naming for future-proofing since ChatGPT's Definition of Done anticipates Kategori merge/split as an admin capability |
| Story was split | Same — no split operation exists today | N/A today, same future-proofing note |
| Story is genuinely, permanently gone (source retracted it, aged out) | Indistinguishable from "stopped being fetched" without a longer observation window | No — treat the same as the first row |

**Recommendation**: this design does not need to solve re-clustering
identity drift today — that's a `lab/engine.js` clustering-algorithm
question, out of scope for an editorial-state lifecycle doc, and no
evidence exists yet that it's actually happening (the swap that just
succeeded reused the same clustering logic that's always run). It is
named here so a future investigation isn't starting from zero if
something like "my hide keeps not working after ingestion" gets
reported.

## 4. What should happen to each table when a story is missing from the new generation

Direct answers, per ChatGPT's numbered questions:

**Does state kekal (persist)? archived? expired? dipindahkan (moved)? or just inactive?**

**It persists, unmodified, exactly as `expires_at` already governs it.**
Not archived, not force-expired, not moved. The row keeps existing;
whether it's "live" is answered by two independent, already-existing
signals working together:
- `expires_at > now()` — the row's own stated lifetime (already exists,
  already enforced by every consumer that reads `active`/checks
  expiry — `editorialStateResolver.mjs`, `reviewQueueAdapter.js`)
- Whether `story_id` currently resolves to a live `story_clusters` row
  — a NEW signal this design introduces, answered by a read-time JOIN,
  not a stored flag

No new lifecycle STATE needs to be invented (no "archived" column, no
"orphaned" boolean). The existing `expires_at` + a read-time existence
check together answer everything ChatGPT asked for.

## 5. What the reader should do in each state

| story_id resolves? | expires_at passed? | Reader behavior |
|---|---|---|
| Yes (live) | No | Override/save/history applies normally — today's exact behavior |
| No (orphaned) | No | Override/save/history is **inert** — there's no live story left for it to apply TO, so it has no observable effect on the reader regardless of whether it's "still valid." This is not a new reader-facing state; it's simply that a `hide` on a story that doesn't exist has nothing to hide. |
| Yes or No | Yes (expired) | Already-existing behavior — ignored, same as today |

**Concretely: the reader needs zero new logic.** An override whose
story doesn't currently exist already has no observable effect, because
every resolver (`editorialStateResolver.mjs`, `productionAdapter.js`)
only ever applies overrides to rows it's actively rendering — a
`story_id` with no matching live cluster was never going to be looked
up in the first place. The "orphan" condition is invisible to the
reader today, and should stay invisible. This section exists mainly to
confirm that explicitly, not to propose new reader code.

## 6. What Admin should see

This is where real, currently-missing visibility belongs — matching
ChatGPT's broader Definition of Done ("Admin mesti boleh tahu... apa
keadaan sebelum, apa keadaan selepas").

An admin viewing Review Queue / Editorial Activity Timeline for a
story that's since become orphaned should be able to see:
- The override still exists and is still "active" per its own
  `expires_at` (not silently vanished)
- A clear, honest label that the underlying story is no longer part of
  the current live generation (e.g. "Berita ini tiada dalam siaran
  RSS terkini" — never claim it was "deleted" or "expired" when
  neither happened)
- The override's remaining natural lifetime (`expires_at`), so the
  admin isn't left wondering when/whether it'll ever stop mattering

This is a **read-only UI addition** for a later phase, not something
this design commits to building now — named here because ChatGPT
explicitly asked "apa yang Admin patut nampak."

## 7. What must never happen automatically

Restating ChatGPT's explicit prohibition, now grounded in §1's finding:
**no automatic DELETE keyed off "story not in current generation."**
This was always going to be wrong, independent of the FK problem — an
admin's `hide` decision has a stated lifetime (`expires_at`) that has
nothing to do with ingestion cadence, and deleting it early because a
re-clustering run happened not to reproduce that exact story would be
exactly the silent loss of editorial decisions ChatGPT flagged as
unacceptable.

The one exception, unchanged from what already happened this session:
a human (Izzat/an editor), after direct verification that a specific
row is test residue or otherwise genuinely meaningless, deletes that
**specific row** by id. That's not automation — it's a manual editorial
action like any other, just happening to use SQL instead of a UI
button today (a future admin UI for this is natural but out of scope
here).

## 8. How the FK should work so ingestion swap never fails on this again

This is the part that actually unblocks future swaps — the direct fix
for the bug found in production.

**Recommendation: drop the hard FK constraint on
`story_overrides.story_id`, `saved_stories.story_id`, and
`history_entries.story_id`** — i.e. stop having Postgres enforce
`REFERENCES story_clusters(id)` at all for these three tables.

This is not a new pattern in this codebase — `source_overrides.source_id`
already does exactly this, with its own schema comment explaining why:
*"not a real FK, that registry is code, not a table."* Here the
rationale is different but the conclusion is the same: **a hard FK is
the wrong tool when the referencing row's validity is governed by its
own independent `expires_at`, not by the referenced row's continued
existence.** The FK currently forces "this row must die exactly when
its story leaves the live table" — a rule nothing in this project's own
design actually wants (§1).

**What replaces the FK's safety property** (never silently accepting a
garbage `story_id`):
- Application-layer validation at write time — the same place that
  already enforces `reason NOT NULL`, `edition_id` values, and
  `override_type` allowed values (`db/editor-auth.mjs`,
  `ui/src/admin/reviewQueueAdapter.js::writeOverride()`) checks that
  `story_id` resolves to a real, currently-live `story_clusters` row
  BEFORE insert. A typo or a fabricated id is caught exactly as
  reliably as before — just at write time instead of via a standing
  constraint. This is strictly the FK's original purpose (reject
  invalid references), not a weakening of it.
- `repoint_story_clusters_fks()` (the swap-time FK-repoint function)
  simply stops needing to touch these three tables at all — no
  DELETE-then-repoint dance like `edition_story_classifications`
  currently needs (§9), because there's no FK left to repoint or
  violate.

**What this does NOT change**: `edition_story_classifications.story_id`
keeps its FK and its existing `ON DELETE CASCADE` + pre-repoint cleanup
— that table is machine-generated output, fully owned by
`classify-production.js`, regenerated wholesale every classification
run, with no independent `expires_at` of its own and no editorial
meaning if orphaned. It belongs in "ingestion-adjacent data," not
"editorial state" — the FK there is protecting something that
actually should die when its story does. The dividing line isn't
"which table," it's "does this row have its own independent lifetime
that ingestion has no authority over."

## 9. How swap should behave once this is implemented (future phase)

Once the FK is dropped:
```
swap_ingestion_staging()
   ALTER TABLE renames (unchanged)
        ↓
   repoint_story_clusters_fks()
        - story_overrides / saved_stories / history_entries: NO LONGER
          NEEDS TO TOUCH THESE — no FK exists to repoint or violate
        - edition_story_classifications: unchanged, still cleaned +
          repointed exactly as today
        ↓
   swap commits — cannot fail on an editorial-state FK ever again
```

A swap can no longer be blocked by a stale admin decision from three
ingestion cycles ago — exactly the failure mode that happened in
production this session, now structurally impossible rather than
avoided by manual row-by-row cleanup before every swap attempt.

## 10. Retention — what happens to very old orphaned rows

Per ChatGPT's question on appropriate retention: **`expires_at` is
already the retention policy** — no new retention mechanism is needed.
An orphaned `story_overrides`/`saved_stories`/`history_entries` row
disappears from being "active" the moment its own `expires_at` passes,
exactly like a non-orphaned one does today. Nothing new to build here;
this section exists only to confirm that explicitly, since ChatGPT
asked directly.

One open question, explicitly NOT decided here (matches the schema's
own existing "OPEN lifecycle dependency" note on `saved_stories`,
`docs/identity-schema-design.md §5`): whether EXPIRED rows are ever
hard-deleted, or kept indefinitely as a forensic/audit trail. This
project has already made that exact call for editorial data once
before — `db/editorial-override-reader-integration.test.mjs` and this
session's audit both note editorial state "has audit value" and isn't
casually dropped. Recommend inheriting that same posture here rather
than deciding a new one, but this is a policy call for whoever reviews
this design, not something this document forces.

## 11. Interaction with Pin (24h), Hide, Reclassify, Saved Stories, History

All five already fit the model in §1–§10 without special-casing, since
all five already go through `story_overrides` (pin/hide/reclassify) or
have their own `expires_at` (saved_stories/history_entries):

- **Pin (24h)**: `story_overrides` row with `override_type='pin'` — its
  `expires_at` is set short (24h) at creation, per this project's own
  established Pin design. If the pinned story becomes orphaned before
  that 24h elapses, per §4 it stays exactly as "pinned, but with no
  live story to apply the pin TO" until its own 24h runs out — no
  special orphan-specific behavior needed.
- **Hide**: same mechanism, longer typical `expires_at` (~1 week per
  §1's schema comment).
- **Reclassify**: same mechanism, `new_field` carried alongside.
- **Saved Stories**: reader-facing, own `expires_at`, same treatment.
- **History**: reader-facing event log, own `expires_at`, same
  treatment, least consequential to orphan per §2.

No table needs different orphan handling from any other — the model in
§1 is uniform across all five features precisely because they already
share the same `expires_at`-governed shape.

## What this document does NOT do

- No code written, no migration applied, no FK actually dropped
- Does not build a generic "orphan cleanup engine" — explicitly
  rejected per ChatGPT's instruction and §7's reasoning
- Does not decide the expired-row hard-delete-vs-retain question
  (§10) — flagged as open, not decided
- Does not address clustering-identity-drift across ingestion runs
  (§3) — named as a distinct, unconfirmed, out-of-scope risk for
  `lab/engine.js`, not this document
- Does not propose any new Admin UI — §6 names what it should
  eventually show, not a component to build now

## Next

Awaiting ChatGPT's review, per the director's explicit "saya akan
semak design tersebut sebagai pengarah projek sebelum satu baris kod
lifecycle ditulis." No FK is dropped, no code is written, until this
design is approved.
