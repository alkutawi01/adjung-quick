# Production Data Lifecycle v2 — Design (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[RISK] design document. No code changed here.**

Per ChatGPT: the broader design pass that
`docs/ingestion-safety-guard-v2-decision.md`'s four answers feed into.
Triggered by the exhaustive audit
(`docs/exhaustive-audit-findings-v1.md`) surfacing that every
destructive-write path in this project shares one root cause: **the
codebase has never had a single, explicit model of which data is
machine-owned versus human-owned, and what "refresh" and "recovery"
mean for each.** This document is that model.

## The three kinds of data, named explicitly

Everything Adjung Quick stores falls into exactly one of these. Mixing
them in one table, or writing one script that treats them the same way,
is the pattern behind every CRITICAL/HIGH finding in the audit.

### 1. Generated data — fully regenerable, machine-owned

```
sources, story_clusters, rss_items, edition_story_classifications
```

Produced entirely from RSS fetches + the classification/ranking
pipeline. No human decision is stored here. **Safe to fully
reconstruct from source at any time** — the only real constraint is
*how* to reconstruct it without an in-between broken state (§Refresh
below), not whether it's safe to regenerate at all.

### 2. User state — human-owned, reader-generated

```
saved_stories, history_entries
```

A real reader's own actions. Currently 0 rows (`docs/post-launch-observations.md`),
which is exactly why this whole audit arc happened now and not after
the first real loss. **Never regenerable** — if lost, it's gone, there
is no source to reconstruct it from.

### 3. Editorial state — human-owned, editor-generated

```
(not yet built — docs/editorial-override-data-model-v1.md)
```

Deliberate corrections layered on top of generated data (reclassify,
hide, promote, pin, source suppression). Already designed under the
**core invariant** from that document, which this doc adopts wholesale
and generalizes:

> **Generated Data ≠ Editorial State.** A table produced by the
> pipeline can never be the place human decisions are stored.

Per ChatGPT: this invariant is bigger than overrides — it also governs
editor notes, user reports, fact-checking annotations, and any future
legal-takedown record. None of those can ever live inside a table the
pipeline regenerates.

## Refresh strategy

**Different data types need different refresh strategies — this was
the mistake.** `db/ingest-production.js` and `db/classify-production.js`
both apply the SAME strategy (delete everything, rebuild from scratch)
to generated data, without ever having to consider user/editorial state
because none existed yet. That stopped being safe the moment
`saved_stories`/`history_entries` went live-but-empty, and will silently
break the instant they're not empty (Trigger B,
`docs/production-safety-decision-proposal-v1.md`).

| Data type | Refresh strategy | Why |
|---|---|---|
| Generated data | **Incremental upsert**, never full delete-then-rebuild. New story → insert. Existing story, new members → update. Story no longer in any feed → mark `aged_out`, never delete outright (per `docs/ingestion-lifecycle-v2-design.md` §3, already answers "what does new/existing/archived mean") | Full-delete strategy is what breaks on any FK to it (audit CRITICAL 1/2), and is what causes the live "empty site" window (audit HIGH, truncate-then-refill) |
| User state | **Never auto-refreshed.** Only ever changes via a reader's own explicit action (save, un-save, a history entry being recorded on release) | It's not derived from anything — there's nothing to refresh it FROM |
| Editorial state | **Never auto-refreshed, never auto-expired except by its own designed rule** (`docs/editorial-override-data-model-v1.md` §2: story overrides expire with story lifecycle, source overrides never auto-expire) | Same reasoning — it's a human decision, not a cache of something else |

The unifying rule: **only generated data ever gets "refreshed" in the
rebuild sense. User and editorial state only ever change through their
own explicit, human-triggered write paths** — never touched by
`ingest-production.js` or `classify-production.js` at all, and
critically, **never blocked by them either** once generated data moves
to incremental upsert (§ above) — there will be nothing left for a
content refresh to destructively collide with.

## Recovery strategy

Per data type, since "recovery" means something different for each:

| Data type | Recovery strategy |
|---|---|
| Generated data | Re-run ingestion from RSS sources. Always possible, by definition (§1). Local snapshot (`db/snapshot-production.mjs`) also covers this for offline testing, not disaster recovery. |
| User state | **The real gap.** `docs/restore-rehearsal-v1.md` already found Supabase Free Plan has zero backup capability; Izzat's decision was free Google Drive sync of the local snapshot as the interim answer (`docs/production-safety-decision-proposal-v1.md`). This is the ONLY data type where that decision actually matters — generated data was never at real risk (it's regenerable), so the backup conversation should be understood as being about user/editorial state specifically, not the dataset as a whole. |
| Editorial state | Same as user state once built — durable, human-authored, not regenerable, needs the same backup coverage. `db/snapshot-production.mjs` should be extended to cover the editorial-overrides table(s) once `docs/editorial-override-data-model-v1.md` is implemented, the same way it was extended for `saved_stories`/`history_entries` on 2026-08-13. |

## How this resolves the audit's frozen items

| Audit finding | Resolution under this model |
|---|---|
| `ingest-production.js:74,59` — guard doesn't work as documented | Becomes moot once generated data uses incremental upsert (§Refresh) — there's no more destructive delete for the guard to protect against. Guard behavior for the transition period is `docs/ingestion-safety-guard-v2-decision.md`. |
| `ingest-production.js:78`, `classify-production.js:152` — truncate-then-refill live-site window | Same resolution — incremental upsert has no window where the live tables are empty, by construction. |
| Editorial override storage | Already correctly designed under this exact invariant (`docs/editorial-override-data-model-v1.md`) — this doc confirms that design was right, generalizes the principle project-wide. |

## What this document does NOT do

- Does not implement incremental ingestion — that's the next real
  engineering task, scoped by `docs/ingestion-lifecycle-v2-design.md`
  and now grounded in this three-way data model
- Does not change any schema, FK, or script
- Does not decide the exact mechanics of the atomic swap /
  incremental-upsert implementation — an engineering decision for when
  that work actually starts, informed by but not made in this document

## Next

Per ChatGPT's triage: this and `docs/ingestion-safety-guard-v2-decision.md`
are the design layer. Production ingestion stays frozen
(`docs/exhaustive-audit-findings-v1.md`) until Izzat/ChatGPT confirm this
model, at which point implementing incremental ingestion becomes a
scoped, reviewable engineering task rather than a reflexive patch.
