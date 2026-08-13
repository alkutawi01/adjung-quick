# Ingestion Safety Guard v2 — Decision (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[RISK] design document. No code changed here.**

Per ChatGPT, in response to the exhaustive audit's two CRITICAL findings
(`docs/exhaustive-audit-findings-v1.md`): the destructive-rebuild guard
built earlier this session (`evaluateDestructiveRebuildGuard`,
`db/production-write-guard.mjs`) doesn't actually deliver the safety it
promises. This document answers the four questions ChatGPT posed before
any patch is written. **Production ingestion is frozen until this is
resolved** — per ChatGPT's explicit instruction, no
`node db/ingest-production.js` runs until then.

## What the audit actually found

**Finding 1 (CRITICAL)** — `ALLOW_DESTRUCTIVE_REBUILD=true`'s own
documented purpose ("deliberately accept that user-referenced clusters
break") cannot happen the way it's written. Postgres's `NO ACTION` FK
check rejects the `story_clusters` delete outright — it doesn't let the
delete through and orphan rows, it **fails the statement**. The error is
never checked, so the script silently falls through into an unrelated,
confusing crash later (a duplicate-key error on the next insert),
leaving `sources` wiped-and-reinserted while `story_clusters`/`rss_items`
stay stale — a half-migrated database with no clear signal of what went
wrong.

**Finding 2 (CRITICAL)** — the guard's own safety check
(`const [{count: savedCount}, {count: historyCount}] = ...`) never reads
`error` from the two count queries. If either query itself fails
(missing table, transient PostgREST error, connection issue), Supabase's
client resolves with `{count: null, error}` rather than throwing —
`null ?? 0` silently becomes "0 user rows, safe to proceed." **A failed
safety check currently behaves identically to a passed one.**

## 1. Fail-closed on query failure

**Decision: any error on the user-data count queries blocks ingestion,
full stop — no forced override possible for this specific failure
mode.**

Rationale: the entire purpose of counting `saved_stories`/
`history_entries` first is to answer "is it safe to destroy
`story_clusters`?" — a query that fails hasn't answered that question,
it's refused to. Treating "I don't know" as "yes, safe" inverts the
guard's whole purpose. This applies even under
`ALLOW_DESTRUCTIVE_REBUILD=true`: that flag means "I accept the
consequences of a KNOWN nonzero count," not "I accept proceeding blind."

```
Count query succeeds, returns 0        → proceed
Count query succeeds, returns > 0      → blocked (or forced, if flag set)
Count query FAILS for any reason       → blocked, unconditionally,
                                          no override
```

## 2. Transaction boundary

**Decision: the three-table destructive delete
(`rss_items`/`story_clusters`/`sources`) must be one atomic operation —
all three succeed or none do — not three independent REST calls.**

Today, each `.delete()` is a separate Supabase REST round-trip with no
shared transaction. Finding 1's failure mode (the `story_clusters`
delete rejected by an FK, `rss_items` already gone) is a direct
consequence of that: partial failure leaves the database in a state that
was never a real, intended snapshot — not "before," not "after," just
broken in between.

The concrete mechanism (deferred to the incremental-ingestion
implementation, not decided in this doc): either a single Postgres
function/RPC call wrapping the deletes in an explicit `BEGIN`/`COMMIT`,
or — better, and consistent with §3 below — replace the delete-then-
insert shape entirely so there's no multi-step destructive sequence to
protect in the first place.

## 3. Partial failure handling

**Decision: no write path may leave the database in a state that is
neither the old content nor the new content.** This is the general
principle behind both the transaction boundary (§2) and the atomic-swap
recommendation already on record for the truncate-then-refill pattern
(`docs/exhaustive-audit-findings-v1.md` HIGH items,
`docs/ingestion-lifecycle-v2-design.md`).

Two acceptable shapes, in order of preference:

1. **Incremental upsert** (the real fix, already scoped in
   `docs/ingestion-lifecycle-v2-design.md`) — new/changed stories are
   upserted, nothing is deleted wholesale, so there's no "in-between"
   state possible by construction.
2. **Staging + atomic swap** — build the new dataset in a
   separate/staging location, then switch over in one atomic step
   (e.g. a single transaction, or a pointer/version swap) only once the
   new data is fully ready. Never delete-then-slowly-rebuild in place.

**Not acceptable**: try/catch around the existing delete-then-insert
sequence that "cleans up" on failure. That treats the symptom (an
observable crash) without removing the actual defect (a destructive
operation with no atomic boundary).

## 4. Emergency rebuild vs. normal refresh

**Decision: these must become two distinct, differently-named
operations, not one script with a bypass flag.**

The audit's core insight, restated: `ALLOW_DESTRUCTIVE_REBUILD=true` was
designed as an escape hatch for a rare, deliberate event — but it sits
on the same code path as routine content refresh, with no structural
difference between "I am knowingly accepting data loss right now" and
"just run the usual script." A flag is not enough separation for an
action this consequential.

Target shape (not implemented yet — this is the decision, not the
build):

```
Normal refresh (routine, frequent)
  → incremental ingestion (§3.1)
  → never destructive, never needs a bypass flag at all

Emergency rebuild (rare, deliberate, human-invoked)
  → a SEPARATE script/command, not a flag on the routine one
  → requires its own explicit confirmation (own env var or prompt,
    not reuse of ALLOW_DESTRUCTIVE_REBUILD)
  → documents in its own output exactly what will be destroyed and why
    it's necessary, before running
```

Once normal refresh is incremental, "emergency rebuild" becomes a truly
rare, consciously-invoked recovery action — not something that can be
reached by routine operation plus one flag.

## What this decision does NOT do

- Does not implement incremental ingestion (tracked separately,
  `docs/ingestion-lifecycle-v2-design.md`)
- Does not modify `db/ingest-production.js`, `db/production-write-guard.mjs`,
  or any schema/FK
- Does not lift the freeze on running production ingestion

## Next

Per ChatGPT: build `docs/production-data-lifecycle-v2-design.md`
covering generated data vs. user state vs. editorial state, refresh
strategy, and recovery strategy — a broader design pass that this
document's four answers feed into. Implementation of any of this waits
for that document and explicit sign-off, consistent with the project's
standing rule against reflexive changes to production data paths.
