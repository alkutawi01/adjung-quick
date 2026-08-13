# Ingestion Destructive Rebuild — Critical Finding (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **Latent architectural bug.** Silent today; guaranteed to fire
the moment a real reader uses the product.

Found while preparing to bring the revived JAKIM sources into production
(`lab/certs/README.md`). Reported rather than worked around, because the
safe-looking action — "just run ingestion" — is exactly the action that
sets the trap.

---

## 1. What `db/ingest-production.js` actually does

It is **not** incremental. Every run:

```js
await supabase.from('rss_items').delete().not('id', 'is', null);
await supabase.from('story_clusters').delete().not('id', 'is', null);
await supabase.from('sources').delete().not('id', 'is', null);
```

…then re-inserts everything from the current RSS fetch. The code says
so plainly, and honestly:

> `// --- Clean slate: this is a fresh schema-only database, safe to`
> `// truncate between runs while iterating.`

That comment was **true when written** (2026-08-11, during initial
production wiring against an empty database). It is **no longer true**:
the same database now serves a live site.

## 2. The bug: the first real reader breaks ingestion

Foreign keys pointing at `story_clusters(id)`:

| Table | ON DELETE | Consequence when clusters are deleted |
|---|---|---|
| `edition_story_classifications` | `CASCADE` | Rows removed — fine, they're regenerated anyway |
| `saved_stories` | **none declared** | Postgres default `NO ACTION` → **delete fails** |
| `history_entries` | **none declared** | Postgres default `NO ACTION` → **delete fails** |

So the moment **one** reader saves **one** story:

```
ingest-production.js
   → DELETE FROM story_clusters
      → foreign key violation (saved_stories still references it)
         → ingestion aborts
```

This does not lose data — it is worse in a different way: **the entire
content pipeline stops working**, and it stops for a reason that looks
unrelated to the feature that caused it.

Today both tables hold 0 rows, so the delete succeeds and nothing is
visibly wrong. That is precisely why it needs recording now rather than
being discovered later by symptom.

This is the concrete mechanism behind **Supabase upgrade Trigger B**
(`docs/production-safety-decision-proposal-v1.md`): "before user data
becomes valuable" is not only about backups — the first real saved story
also breaks ingestion.

## 3. Second, quieter consequence: the product has no memory

Because every run wipes and rebuilds from the current feeds, the
database only ever contains **what the feeds happen to carry right
now** (~10 recent items per feed). A story that ages out of its
publisher's feed disappears from Adjung Quick entirely on the next
ingestion.

Implications worth deciding on deliberately rather than inheriting:

- A reader's saved story could point at a cluster that no longer exists
- `history_entries` has the same exposure
- Any "what did we publish last week" question is unanswerable
- The Fasa 1 observation baseline measures a *rebuilt* set each time,
  not an accumulating one — worth knowing when reading day-over-day
  diffs in `db/observations/`

## 4. Why this was not fixed on the spot

Changing ingestion from destructive-rebuild to incremental-upsert is a
real architecture change, not a patch:

- Story identity across runs must be trusted (`clusterKey` stability)
- Retention/expiry becomes a real question — without the wipe, nothing
  ever removes old stories
- Clustering behaviour when an existing cluster gains a new member needs
  defining
- It interacts directly with the reader-data lifecycle
  (`docs/identity-schema-design.md` §5 already flags this as an OPEN
  lifecycle dependency)

Doing that quietly, mid-Fasa-1, while the stated discipline is
*observe → understand → decide → change*, would be exactly the
scope creep the post-launch phase is meant to prevent.

## 5. Immediate practical impact

**The JAKIM fix cannot reach readers without running ingestion**, and
ingestion is the destructive path described above.

Today that is safe (0 user rows) — but "safe today" is a reason to
decide consciously, not to proceed automatically. **No ingestion has
been run.** Awaiting a decision.

## 6. Options

| Option | Effect | Risk |
|---|---|---|
| **A.** Run ingestion now | JAKIM content goes live immediately | Safe *today* (0 user rows); does nothing about the latent bug |
| **B.** Fix ingestion to be incremental first | Removes the trap permanently | Real architecture work; belongs in Fasa 3/4, not Fasa 1 |
| **C.** Add `ON DELETE CASCADE` to the two identity FKs | Ingestion never fails | **Silently destroys reader data** — rejected: turns a loud failure into a quiet one |
| **D.** Guard ingestion: refuse to run if user data exists | Turns a confusing FK error into a clear, early refusal | Small, honest, does not pretend to solve the architecture |

**Recommended: A + D.** Run ingestion now while it is genuinely safe, so
the JAKIM fix reaches readers and the Fasa 1 baseline stops measuring a
degraded state — and add the guard so that the day this stops being safe,
the system says so plainly instead of failing obscurely. Option B stays
on the roadmap as the real fix, correctly placed.

**Option C should be explicitly rejected**, not merely unchosen: it
would make the symptom disappear by deleting readers' saved stories
without telling anyone.
