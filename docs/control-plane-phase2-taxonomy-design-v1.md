# Backend Control Plane — Phase 2: Taxonomy/Kategori, Design v1 (2026-08-17)

Status: `[x] Design` `[ ] Approved` — no schema, no migration, no code.

Per ChatGPT's tightly-scoped instruction: **Admin can manage Kategori
from the backend without code changes, and stories don't break when a
label changes.** Nothing more. Explicitly out of scope: Classification
Rules, Attention Rules, generic rule engine, big admin UI, split
operation, any migration not needed for a stable category ID.

## 0. What already exists — don't re-solve this

`classification/lib/taxonomy-registry.mjs`'s `TAXONOMY_REGISTRY` is
**already the single source of truth in code** — a prior session
(Taxonomy Stable Field-ID V1) already collapsed what were two
independently hand-maintained lists (`state/editions.js`'s `taxonomy`
array and `classification/lib/edition-taxonomy.mjs`'s
`EDITION_TAXONOMY`) into this one file; both now derive their shape
from it. **The gap Phase 2 actually closes is narrower than "unify the
lists" — it's "move this one already-unified list from code into a DB
table."** Confirmed by direct read — no `taxonomy_fields` table exists
anywhere in this schema.

Current shape, per edition, each entry: `field_code` (stable, never
renamed — every consumer's real key), `label` (the only
Admin-editable field), `subject_codes` (which Universal Subject
value(s) resolve here — classification-internal, not Admin-facing),
`wheel_visible` (reader display toggle).

## 1. `taxonomy_fields` — the new table

```
taxonomy_fields
  id              UUID PK
  edition_id      TEXT NOT NULL          -- 'ms-MY' | 'en-global' | 'ar-global'
  field_code      TEXT NOT NULL          -- stable, immutable once created
  label           TEXT NOT NULL          -- Admin-editable
  subject_codes   TEXT[]                 -- classification-internal, nullable (geography-residual fields)
  wheel_visible   BOOLEAN NOT NULL DEFAULT true
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))
  display_order   INTEGER NOT NULL       -- preserves the Wheel's existing curated order (§0's file comments show this order is deliberate, not alphabetical)
  UNIQUE (edition_id, field_code)
```

Backfilled 1:1 from `TAXONOMY_REGISTRY` — 16+16+13 = 45 rows, deterministic,
same fail-closed discipline as every prior migration this session
(Source Registry's backfill script is the direct template).

**What's explicitly NOT in this table**: no `parent_field_code`, no
`merge_history`, no `rule_conditions` — none of that is needed for
"rename works" or "merge works," and adding it now would be exactly
the overengineering both Izzat and ChatGPT just flagged.

## 2. The three operations Admin needs — precisely, no more

**Add**: insert a new row. `field_code` chosen by Admin at creation
time (never changes after — same immutability discipline as every
other stable ID in this project), `label` freeform, `subject_codes`
optional/advanced (a genuinely new Kategori with no classifier mapping
yet is valid — it just won't auto-populate until a human or a future
Classification Rules phase wires evidence to it).

**Rename**: `UPDATE taxonomy_fields SET label = ? WHERE id = ?`.
`field_code` never touched. Every classification row, override, and
reader query already keys on `field_code`, never `label` (confirmed —
`getFieldLabel()` is the ONLY place a `field_code` becomes user-visible
text, per the registry file's own header comment) — a rename is
**purely cosmetic to the stored data**, which is exactly why this
project did the Stable Field-ID migration first. This is the
whole payoff of that earlier work.

**Merge**: two existing `field_code`s become one. Real data migration,
not cosmetic:
```
merge_taxonomy_fields(from_field_code, into_field_code, edition_id)
  1. UPDATE edition_story_classifications SET field_code = into_field_code, field = <into's label>
     WHERE field_code = from_field_code AND edition_id = edition_id
  2. UPDATE story_overrides SET new_field_code = into_field_code
     WHERE new_field_code = from_field_code AND edition_id = edition_id
     -- (only rows where override_type='reclassify' have new_field_code set)
  3. taxonomy_fields: mark the FROM row status='archived' (never deleted —
     historical/audit trail, same posture already established for
     editorial state in this session's other design docs)
  All three steps in ONE transaction — a merge that updates
  classifications but not overrides (or vice versa) is a worse,
  harder-to-detect bug than no merge at all.
```

**Split is explicitly NOT built** — per ChatGPT's direct instruction,
this requires a human editorial decision about which specific stories
go where; no algorithm should guess. If ever needed, it's a manual,
story-by-story reclassify operation using the tooling that already
exists (`writeOverride()`), not a bulk "split" primitive.

## 3. Consumer migration — every place that reads `TAXONOMY_REGISTRY` today

Per direct grep, the consumers are: `state/editions.js` (builds
`taxonomy`/`taxonomyFieldCodes` arrays for the Wheel),
`classification/lib/edition-taxonomy.mjs`, `db/backfill-taxonomy-codes.mjs`
(one-time migration script, already run, not a live consumer),
`ui/src/App.jsx`, `ui/src/admin/AdminApp.jsx`, `ui/src/admin/ReviewQueueCard.jsx`,
`state/reducer.js`, `state/test.js`.

**Migration approach, staged not big-bang** (per this session's
established discipline): `state/editions.js` and
`classification/lib/edition-taxonomy.mjs` are the only two that need
to change their *data source* (from importing the JS constant to
querying `taxonomy_fields`) — every other file already consumes
`EDITIONS`/`getFieldEntry()`'s existing exported shape and needs zero
changes, since those functions' public API stays identical; only what
backs them moves.

## 4. What Phase 2 does NOT do (per ChatGPT's explicit list)

❌ Classification Rules (URL/keyword → field_code automation) — Phase 3
❌ Attention Rules — future phase, not numbered yet
❌ Generic Rule Engine — rejected architecture, every phase gets its
  own purpose-built table
❌ Large Admin UI — this phase proves the backend operations exist and
  are correct; a full Kategori management screen is a later, separate
  UI pass
❌ Pin/Filter automation — untouched
❌ New AI classification — the frozen classifier stays frozen
❌ Ranking redesign — untouched
❌ Any migration not required for stable, backend-controlled category
  identity — the explicit test for everything in this phase

## 5. Definition of Done for Phase 2 (ChatGPT's own list, restated as acceptance criteria)

- [ ] Admin can add a Kategori (backend operation exists, tested)
- [ ] Admin can rename a Kategori (label-only, `field_code` provably unaffected)
- [ ] Admin can activate/archive a Kategori
- [ ] Admin can merge two Kategori via one real backend operation
      (not two manual steps)
- [ ] Admin can list all Kategori (per edition)
- [ ] Reader never depends on `label` as identity — confirmed already
      true (§2), re-verified after the migration, not just assumed

## What this document does NOT do

- No schema written, no migration executed, no RPC/adapter code written
- Does not build split
- Does not build any admin UI
- Does not decide the exact RPC function signatures — that's the
  Implementation Plan's job, next

## Next

Awaiting ChatGPT's review before the Implementation Plan (RPC surface,
migration order, rollback, verification — same shape as Phase 1's own
implementation plan) is written.
