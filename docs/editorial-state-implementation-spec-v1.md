# Editorial State Implementation Spec v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] implementation spec. No table created, no
migration run, no UI built here.** Fasa 3.1 — the first concrete step
of Editorial Operations MVP. Consolidates
`docs/editorial-override-data-model-v1.md`'s already-locked design into
a build-ready contract, plus the two pieces ChatGPT asked to make
explicit: lifecycle and the pipeline integration point.

**Question this answers**: *"Apabila admin membuat keputusan, di mana
sistem menyimpannya?"* — nothing about how the admin reaches that
decision (Review Queue, Admin Digest — Fasa 3.3/3.5) is in scope here.

---

## 1. Editorial state objects

Two objects, unchanged from `docs/editorial-override-data-model-v1.md`
§1 — restated here in build-ready form.

### Story Override

```sql
CREATE TABLE story_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id        TEXT NOT NULL REFERENCES story_clusters(id),
  edition_id      TEXT NOT NULL,       -- 'ms-MY' | 'en-global' | 'ar-global'
  override_type   TEXT NOT NULL CHECK (override_type IN ('reclassify','hide','boost','pin')),
  new_field       TEXT,                -- reclassify only; must exist in that edition's taxonomy
  reason          TEXT NOT NULL,       -- REQUIRED — never optional, per §3 below
  created_by      UUID NOT NULL REFERENCES editors(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL, -- REQUIRED for story-level (§2)
  active          BOOLEAN NOT NULL DEFAULT true
);
```

Admin-facing example (not a schema field — illustrative of what this
row means to a human, per the v2 plan's language layer):

```
Cerita:    Gempa bumi Sarawak
Keputusan: Bidang = Bencana
Sebab:     Sistem tersilap letak
Oleh:      Izzat
Tarikh:    13 Ogos 2026
```

### Source Override

```sql
CREATE TABLE source_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id        TEXT NOT NULL,      -- lab/sources.js id
  override_type    TEXT NOT NULL CHECK (override_type IN ('ignore_category','reduce_trust','disable')),
  trust_override   NUMERIC,            -- reduce_trust only
  reason           TEXT NOT NULL,
  created_by       UUID NOT NULL REFERENCES editors(user_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  review_date      DATE                -- optional reminder only, never auto-acts
);
```

Admin-facing example:

```
Sumber:    RTM Ekonomi
Keputusan: Abaikan kategori sumber
Sebab:     Kategori feed sering tidak sama dengan kandungan
```

## 2. Lifecycle

Every override moves through the same three states — restated from
`docs/editorial-override-data-model-v1.md` §2, made explicit as its own
diagram per ChatGPT's request:

```
Created
   ↓
Active
   ↓
Expired / Retired
```

**Never hard-deleted.** `active = false` (story) / `status = 'retired'`
(source) is how an override ends — the row stays, so "why did this
change?" is always answerable later, not just at the moment of change.

- **Story overrides expire automatically** — `expires_at` is required
  at creation. News has a lifecycle (~1 week, this project's own
  established content shelf-life); once a story's override expires, the
  classifier decides again from scratch.
- **Source overrides never auto-expire.** `status` only changes via a
  deliberate admin action. `review_date` is a reminder field only — it
  prompts a human to revisit, it never itself changes `status`.

## 3. Audit trail — designed for the actual admin, not a developer

Per the v2 plan's human-first principle: the audit trail's job is
answering *"kenapa berita ini berubah?"* in one glance, not producing a
technical log.

```
15 Ogos

Sistem:  Politik
Editor:  Nasional
Sebab:   Kandungan bukan parti politik
```

This is a direct read of `story_overrides` — `new_field` (the "Editor:"
line), `reason` (the "Sebab:" line), `created_at` (the date), joined
against whatever the classifier's own output was for that story
(`edition_story_classifications.field`, the "Sistem:" line). No new
audit-specific table is needed — the override row itself, read
correctly, **is** the audit trail. Adding a separate audit log would
duplicate data the override table already holds.

`reason` remains mandatory at the database level (`NOT NULL`) —
enforced structurally, not just by UI convention, so no future write
path (including a rushed admin action) can create an unexplained
override.

## 4. Integration point — where this meets the rest of the pipeline

```
Generated classification   (edition_story_classifications, machine-owned, regenerable)
        ↓
Editorial override layer   (story_overrides / source_overrides, human-owned, durable)
        ↓
Ranking                    (candidate scoring + boost/pin, per docs/ranking-engine-contract-v1.md's amendment)
        ↓
Reader
```

**The lesson this structurally encodes** (per ChatGPT, and per this
session's own `edition_story_classifications` truncate-on-every-run
incident): a table the pipeline regenerates can never be where a human
decision lives. `story_overrides`/`source_overrides` are never touched
by `db/classify-production.js`'s truncate — they sit in a completely
separate table, read at query time (not write time) to produce the
"final editorial state" a reader or the Review Queue sees.

**Not specified here** (implementation-time decision): the exact query
shape that merges classification + override into one read — a SQL view,
a function, or application-layer merging. All three satisfy the
contract above; the choice doesn't change the data model.

## What this spec does NOT do

- Does not create any table — this is the spec, not the migration
- Does not build the Review Queue, Admin Digest, or any UI
- Does not implement admin authentication (Fasa 3.2, next)
- Does not decide the query-merge mechanism (implementation-time choice)

## Next

Per ChatGPT's locked sequence:

```
3.1 Data Foundation        ← this document
3.2 Admin authentication
3.3 Review Queue
3.4 Override actions
3.5 Admin Digest
```

Review before implementation begins, per standing practice.
