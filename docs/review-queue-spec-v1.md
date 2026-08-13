# Review Queue Spec v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] spec. No UI or query code built here.** Fasa 3.3.
Formalizes the Review Queue design already outlined in
`docs/editorial-operations-mvp-plan-v2.md` §2 into a build-ready
contract — what populates it, how each entry is worded, what actions it
offers.

## What populates the queue — reuses existing detection, no new logic

Per `docs/editorial-operations-mvp-plan-v1.md` §3, unchanged: every
source is something `db/classification-observatory.mjs` already
computes. The Review Queue is a **query + presentation layer**, not a
new detection system.

| Internal source | `reason_code` |
|---|---|
| Observatory's low-confidence sample (`confidence < 0.5`) | `low_confidence` |
| Observatory's possible-mismatch sample | `content_mismatch` |
| Observatory's unclassified queue | `no_evidence` |
| A story an editor manually flags (needs `editorial-action-spec-v1.md`'s actions to exist first) | `manual_flag` |

## Entry format — human-first, per the v2 plan's language layer

Every entry, regardless of `reason_code`, renders identically in shape
— the admin learns one pattern, not one per reason type:

```
[Story title]

Kenapa muncul: [display_reason — one plain sentence]
Cadangan sistem: [Bidang]        ← only if the system has a guess

Tindakan:
[Terima]  [Ubah bidang]  [Sembunyikan]
```

### `reason_code` → `display_reason` lookup (the actual translation table)

| `reason_code` | `display_reason` |
|---|---|
| `low_confidence` | "Sistem belum pasti bidang yang sesuai." |
| `content_mismatch` | "Kandungan berita kelihatan berbeza daripada bidang yang dipilih." |
| `no_evidence` | "Sistem tidak jumpa petunjuk untuk letak berita ini dalam mana-mana bidang." |
| `manual_flag` | "Ditandakan oleh editor untuk semakan." |

This table is the one piece of new, real content this spec adds — every
other reason already exists as a `reason_code`-shaped fact in the
observatory's output; this is purely its plain-language translation.

## Actions — same three, every time

| Button | Effect |
|---|---|
| **Terima** | Confirms the system's own suggestion (if one exists) as a `reclassify` override — or, for `no_evidence`/no-suggestion cases, simply dismisses the entry with no override written (system's "unclassified" stands) |
| **Ubah bidang** | Opens a plain Bidang picker (the same 16-item list the reader-facing Wheel already shows — no separate admin taxonomy), writes a `reclassify` override |
| **Sembunyikan** | Writes a `hide` override |

Every action requires a `reason` (per
`docs/editorial-state-implementation-spec-v1.md` §1's `NOT NULL`
constraint) — the UI must not allow submitting without one, even a
short one. This is a hard requirement carried down from the schema, not
a UI nicety.

## Ordering and volume — keep it small, per the admin's actual capacity

- Sorted by most recent first (a story from today matters more than one
  from last week that's about to expire from the ranked queue anyway)
- **No pagination-heavy design** — if the queue regularly holds dozens
  of items, that's a signal the underlying detection thresholds need
  recalibration (a Fasa 2-style question), not something the Review
  Queue UI should try to compensate for with filters/search. Not solved
  here — flagged as a future signal to watch, consistent with
  `docs/observation-conclusion-v1.md`'s observe-first discipline.

## What this spec does NOT do

- Does not build the Review Queue UI
- Does not write the query that joins observatory-style detection with
  live production data at request time (implementation detail)
- Does not implement `manual_flag` (depends on
  `docs/editorial-action-spec-v1.md`'s actions existing first)
- Does not decide what happens if the queue is empty (a reasonable
  future addition to the Admin Digest — "tiada apa perlu semakan hari
  ini" — not designed here)
