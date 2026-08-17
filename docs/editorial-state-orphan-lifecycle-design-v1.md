# Editorial State Orphan Lifecycle — Design v1 (2026-08-17)

Status: `[x] Design` `[ ] Approved` — **revised twice, 2026-08-17.**
Rev 1: added §8a–8e (race-condition analysis) per ChatGPT's first
review. Rev 2: ChatGPT identified that §8d's concurrency proof for
Option B (`FOR KEY SHARE`) relied on an unverified assumption about
PostgreSQL relation-resolution timing during a blocked lock wait — this
project has no safe Postgres test environment to confirm it. Decision
changed to **Option D** (`pg_advisory_xact_lock`, §8a/§8f), whose
correctness follows from the primitive's own documented contract
instead of needing that proof. Still no code written, no schema
migration, no cleanup mechanism built.

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

### 8a. What replaces the FK — three options, compared (per ChatGPT's explicit requirement)

The FK's safety property was never just "reject a garbage `story_id`
at write time" — it was that PLUS **atomicity**: Postgres's own FK
enforcement takes a row-level lock (`FOR KEY SHARE`) on the referenced
row for the duration of the check, so no concurrent operation can make
that row disappear between "checked, it exists" and "committed, the
reference is now real." Any replacement must be judged against that
same atomicity property, not just against the happy path.

**Option A — Application-layer validation only** (originally proposed
in this document's first draft; **ChatGPT correctly rejected this**):
```
Admin's write path:
  1. SELECT story_clusters WHERE id = X          -- sees: exists
  2. (concurrent ingestion swap renames the table, X is gone)
  3. INSERT story_overrides(story_id = X)         -- succeeds anyway
```
Step 1 and step 3 are two separate statements with no shared lock
between them — under Postgres's default READ COMMITTED isolation,
nothing prevents another transaction from committing in between. This
is a textbook TOCTOU (time-of-check-to-time-of-use) race. **Rejected**
— does not provide the guarantee a removed FK was providing.

**Option B — Database trigger performing the check inside the write's own transaction**:
```sql
-- Illustrative shape only — not proposed for implementation yet
CREATE OR REPLACE FUNCTION validate_story_exists()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM 1 FROM story_clusters WHERE id = NEW.story_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_id % does not exist in the current live generation', NEW.story_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
The critical detail: `FOR KEY SHARE` is the **exact same row-lock mode
Postgres's own FK enforcement uses internally** — this is not a weaker
imitation of what the FK did, it is the identical primitive. Because
the check runs inside the INSERT's own transaction and takes a real
lock, it closes Option A's race: either the row is genuinely still
there when the trigger fires (lock acquired, insert proceeds), or it
isn't (exception raised, transaction rolls back, no invalid row is
ever created). This has all of a real FK's atomicity, without being a
standing referential constraint — see §8b for why that distinction is
what un-blocks the swap.

**Option C — Explicit transaction/locking strategy at the call site**
(e.g., the app wraps existence-check + insert in one client-managed
transaction with an explicit `LOCK`/`FOR UPDATE`): technically
equivalent to Option B's guarantee if implemented correctly, but
strictly worse in practice for this codebase — every write path
(`writeOverride()` and any future admin action) would have to
correctly re-implement the same locking discipline by hand, in
JavaScript, calling Supabase's REST layer (which does not expose
raw multi-statement transactions the way this project's own comments
already note — `db/ingest-production.js`'s header explains PostgREST
issues one HTTP request per statement, no client-side BEGIN/COMMIT
across separate `.from()` calls). A single missed call site
silently reintroduces Option A's race. Postgres already solved this
exact problem for the FK; re-solving it per-call-site in application
code is strictly more error-prone for equivalent protection.

**Option D — a dedicated transaction-scoped advisory lock as an explicit boundary**
(added per ChatGPT's second review, 2026-08-17 — Option B's `FOR KEY
SHARE` claim turned out to rest on an unverified assumption about
Postgres relation-resolution timing; see §8d for why this matters and
§8f for why D avoids needing that assumption at all):
```sql
-- Illustrative shape only — not proposed for implementation yet
-- Editorial writes (trigger on story_overrides/saved_stories/history_entries):
  PERFORM pg_advisory_xact_lock_shared(hashtext('adjung_quick_ingestion_swap_boundary'));
  PERFORM 1 FROM story_clusters WHERE id = NEW.story_id;   -- FOR KEY SHARE no longer load-bearing here — see §8f
  IF NOT FOUND THEN RAISE EXCEPTION '...'; END IF;

-- swap_ingestion_staging(), as its very first statement:
  PERFORM pg_advisory_xact_lock(hashtext('adjung_quick_ingestion_swap_boundary'));
  -- ... existing ALTER TABLE renames follow, unchanged ...
```
`pg_advisory_xact_lock_shared`/`pg_advisory_xact_lock` are a documented
Postgres primitive with precise, simple semantics (PostgreSQL docs,
"Advisory Locks"): any number of transactions may hold the SHARED form
of a given key concurrently; the EXCLUSIVE form cannot be granted while
any SHARED (or EXCLUSIVE) holder exists, and vice versa; both are
automatically released at transaction end (commit or rollback) when
using the `_xact_` variant — no manual unlock needed, no risk of a
forgotten release leaking the lock. This gives a clean mutual-exclusion
boundary: **no editorial write's transaction and the swap's transaction
can ever be "in progress" at the same time**, full stop — not "probably
serialized via an inferred side-effect of table-level locking," but
literally, by the lock's own documented contract, mutually exclusive.
This makes §8d's Case 1/Case 2 analysis **provably correct by the
advisory lock's own semantics alone** — it does not depend on any claim
about what `story_clusters` resolves to after a blocked query wakes up,
because with D, no editorial write is ever blocked-and-waiting while a
swap is concurrently renaming anything — one side always fully finishes
(commits or rolls back) before the other side's lock request is even
granted.

**Decision: Option D**, not B — reversed from this document's first
draft. B is not wrong in principle (its `FOR KEY SHARE` idea is a real,
correct Postgres mechanism for row-level FK-equivalent locking), but
proving its safety for THIS specific scenario requires verifying subtle
relation-name-resolution behavior across a blocked lock wait during
concurrent DDL — exactly what §8d's revision below explains this
document cannot currently prove. D sidesteps that requirement entirely
by using a primitive whose safety is guaranteed by its documented
contract, not by an interpretation of DDL/DML interaction internals.
D's operational cost is the same class as B's: both are enforced from
exactly two choke points (a shared trigger function on the 3 tables,
and the swap function's own entry point) — not scattered per-call-site
like Option C, so D is not meaningfully harder to apply correctly than
B was believed to be.

### 8b. Why a write-time-only check (B or D — this applies to both) doesn't reintroduce the swap-blocking problem

The original bug was never "writes need to validate `story_id`" — it
was "a **standing constraint** re-validates EVERY existing row's
`story_id` at swap time, and fails the whole swap if even one old row
(created in a past transaction, already committed) doesn't resolve
against the new generation." A trigger only fires on INSERT/UPDATE of
that specific row, at that specific moment — it says nothing about
rows that already exist. Once the FK itself is gone, `swap_ingestion_staging()`'s
`ALTER TABLE ... RENAME` has nothing left to re-check against
`story_overrides`/`saved_stories`/`history_entries` at all, regardless
of how many old rows in those tables point at stories the new
generation doesn't have. That's the actual fix — the trigger (under
either B or D) is what makes new writes safe, not what makes the swap
succeed; those are two separate problems this design was at risk of
conflating. This part of the reasoning is unaffected by the B→D switch.

`repoint_story_clusters_fks()` (the swap-time FK-repoint function)
simply stops needing to touch these three tables at all — no
DELETE-then-repoint dance like `edition_story_classifications`
currently needs (§9), because there's no FK left to repoint or
violate.

### 8c. Precise definition of "currently live story" (per ChatGPT's explicit request)

**"Live" means: a row exists in the table currently named
`story_clusters`, evaluated by the trigger's own `SELECT ... FOR KEY
SHARE` query, executed inside the SAME transaction as the write.**

Not "any `story_id` that was ever valid" (too permissive — would let
Admin actions target arbitrary garbage). Not a cached/precomputed list
(would reintroduce a staleness window — a plain restatement of Option
A's race under a different name). The trigger always resolves against
whatever `story_clusters` currently is at the exact instant of the
write's own transaction — which, because `ALTER TABLE ... RENAME` is
itself a transactional DDL statement requiring an `ACCESS EXCLUSIVE`
lock, is a well-defined, unambiguous answer even during a swap (§8d
works through exactly this timing).

### 8d. Concurrency scenario — Admin writes while an ingestion swap is in flight (per ChatGPT's explicit request), and why the first draft's proof was incomplete

**This document's first draft claimed** that if the swap wins the
race for `story_clusters`'s lock, Admin's blocked `FOR KEY SHARE`
query would, upon waking up, automatically re-resolve against the
NEW `story_clusters` (the just-promoted staging table) rather than the
OLD one (now renamed to `story_clusters_old`). **ChatGPT correctly
identified this as an unproven assumption, not a demonstrated fact.**
The honest state of that claim:

- The specific mechanism that WOULD make it true is real and
  documented: PostgreSQL resolves a `RangeVar` (a bare table name in a
  query) to a relation OID, and when the requested lock on that OID
  can't be granted immediately, the resolving function re-validates
  that the name still maps to the same OID *after* the lock is finally
  acquired — retrying resolution if a concurrent DDL statement (like a
  `RENAME`) changed what the name points to while the wait was
  happening. This is PostgreSQL's standard defense against exactly
  this class of race between DML and concurrent DDL.
- **What this document cannot honestly claim**: that this behavior has
  been verified against this project's specific Supabase-hosted
  Postgres version, inside a `plpgsql` trigger invoked via Supabase's
  PostgREST connection-pooling layer, for this exact statement shape
  (`SELECT ... FOR KEY SHARE` inside a trigger fired by an `INSERT`
  coming through PostgREST). No local or isolated Postgres test
  environment exists in this project (every schema file's own header
  already says so — applied manually via Supabase SQL Editor, no
  migration runner) to safely construct and observe this exact race
  without risk to the shared production database. Per ChatGPT's
  explicit instruction, this document does **not** claim that
  proof — it states this limitation plainly instead of asserting an
  unverified mechanism as settled fact.

**This is exactly why §8a's decision changed from B to D.** Option D
does not need this proof at all — its correctness follows directly
from `pg_advisory_xact_lock`'s own documented, simple contract (mutual
exclusion between SHARED and EXCLUSIVE holders of the same key), which
requires no claim whatsoever about relation-resolution timing during a
blocked wait. The race scenario below is worked through under Option D,
where it can be reasoned about with full confidence.

```
Admin clicks Hide on story X                    Ingestion swap running
        │                                                │
        │  pg_advisory_xact_lock_shared(K)               │  swap_ingestion_staging()
        │       — succeeds immediately UNLESS             │  pg_advisory_xact_lock(K)
        │         swap already holds the EXCLUSIVE         │       — succeeds immediately
        │         form of K                                │         UNLESS any editorial
        ▼                                                ▼         writer holds SHARED K
   By pg_advisory_xact_lock's documented contract: SHARED and
   EXCLUSIVE holders of the same key are MUTUALLY EXCLUSIVE. Exactly
   one of the two transactions proceeds past its lock-acquisition step
   first; the other blocks until the first COMMITS OR ROLLS BACK
   (releasing its xact-scoped advisory lock automatically).
```

**Case 1 — Admin's transaction acquires the SHARED lock first**: the
swap's `pg_advisory_xact_lock(K)` call blocks completely — it cannot
even begin its `ALTER TABLE` statements — until Admin's transaction
commits or rolls back. Admin's existence check and insert run against
whichever generation is currently live (unambiguous — nothing is
mid-rename), and commit normally. Only then does the swap's exclusive
lock get granted and its renames proceed. **Result: fully serialized,
no ambiguity, no invalid row possible — by the lock's own contract, not
by an inference about DDL behavior.**

**Case 2 — Swap acquires the EXCLUSIVE lock first**: Admin's
`pg_advisory_xact_lock_shared(K)` call blocks completely — the trigger
cannot even reach its `story_clusters` existence check — until the
swap's ENTIRE transaction (all three renames, `repoint_story_clusters_fks()`,
everything) has committed or rolled back. Only after that does Admin's
transaction proceed, and by then the swap is a completed, committed
fact — `story_clusters` is unambiguously the new generation, no lock
wait on a renaming table is involved at all, and the existence check
runs cleanly against it:
- If story X **is** in the new generation too (common — most stories
  survive a re-ingestion): the check succeeds, insert proceeds
  normally.
- If story X is **not** in the new generation: the check finds
  nothing, the trigger raises, the `INSERT` is rolled back. **The
  write fails cleanly — no invalid row is ever created.**

**What changed vs the first draft's Case 2**: the first draft required
believing Admin's *already-in-flight, blocked* query would correctly
re-target itself post-rename. Under Option D, Admin's query is never
in flight during the rename at all — it's blocked at a completely
separate, simple mutex *before* it ever touches `story_clusters`, and
only proceeds once the swap is entirely finished. There is no
relation-resolution subtlety left to reason about.

**What the Admin sees on failure**: a clear, specific error — e.g.
*"Berita ini tiada lagi dalam edisi RSS terkini, jadi tindakan ini
tidak dapat disimpan."* (exact copy is a later implementation detail,
not decided here) — not a generic 500, not a silent no-op.

**Can the Admin retry?** Yes — a retry against the same now-orphaned
story X will fail again for the same, correct reason: the story is
genuinely gone from the live generation.

**Can this race ever produce an invalid row?** No — under Option D,
this follows directly from `pg_advisory_xact_lock`'s documented
mutual-exclusion contract, not from an inference about internal
Postgres relation-resolution behavior this document cannot verify.

### 8f. Trade-off summary, B vs D

| | Option B (`FOR KEY SHARE` trigger) | Option D (advisory lock boundary) |
|---|---|---|
| Closes Option A's TOCTOU race | Yes, in the common case | Yes, unconditionally |
| Proof basis | Relies on PostgreSQL's RangeVar re-resolution-after-blocked-lock behavior — real mechanism, but **unverified here** for this exact trigger/PostgREST shape | Relies on `pg_advisory_xact_lock`'s documented SHARED/EXCLUSIVE contract alone — no DDL-timing claim needed |
| Verifiable without a live Postgres test environment? | No — the specific claim in §8d's first draft cannot be confirmed by reading documentation alone; it needs an actual observed trace | Yes — the lock's contract is sufficient on its own |
| Choke points to implement correctly | 2 (shared trigger function; swap function) | 2 (same two — the trigger additionally takes the shared lock; the swap function additionally takes the exclusive lock first) |
| What it protects against post-swap old rows | Nothing — orphan rows from past commits still exist, exactly as intended (§8b) | Same — unrelated to which locking primitive is used |

**Decision stands: Option D**, specifically because this project has no
safe way to empirically verify B's timing claim (per ChatGPT's explicit
instruction not to claim unverified concurrency proof), and D achieves
the same goal without needing that verification at all.

### 8e. The boundary principle this design locks (per ChatGPT's explicit instruction)

```
INGESTION
  can replace which stories exist
        │
        │  CANNOT
        ▼
EDITORIAL STATE
  ├── Pin
  ├── Hide
  ├── Reclassify
  ├── Saved Stories
  └── History
```

**Ingestion never has the authority to delete editorial state.** It
can only cause a piece of editorial state to have no live story left
to apply to (§5) — a row without an effect, not a row that's been
removed. Symmetrically, **an editorial action can never block or
corrupt an ingestion swap** — §8a–§8d's design is what makes both
halves of this boundary hold at the same time, which the pre-FK-removal
design (a hard, bidirectional FK) could not: it let ingestion's own
table-rename mechanics threaten to fail because of unrelated editorial
decisions, exactly the incident that triggered this document.

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

Once the FK is dropped and Option D's advisory lock is added:
```
swap_ingestion_staging()
   pg_advisory_xact_lock(K)   -- NEW, per §8a/8d — first statement,
        ↓                        blocks until no editorial writer
                                  currently holds the SHARED form of K
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
