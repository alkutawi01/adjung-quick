# Editorial Attention Model v2 (2026-08-16)

Status: `[x] Design` `[ ] Approved` — **no code, no UI, no classifier change**

FASA 4.3, per ChatGPT's instruction after the production simulation
(`docs/editorial-attention-implementation-plan-v1.md`'s V1 evaluator,
run via `db/simulate-editorial-attention-production.mjs`) and the
follow-up read-only age analysis: V1's `low_confidence` signal treats
every classification below the existing 0.5 threshold as
`action_required`, with no further qualification. Against real
production data this produced 19 items — proven, not assumed, to be
too many for Izzat's actual usage pattern (per
`docs/editorial-desk-admin-ux-simulation-v1.md`). This document locks
the V2 fix: **age is a qualification gate for `low_confidence`, not a
ranking input.**

## What the data actually showed

Sorted by age, the 19 real `low_confidence` production items had a
genuine gap, not a smooth distribution:

```
<24h:    2 items
24-48h:  0 items   ← empty
48-72h:  1 item
72h-7d:  7 items
>7d:     9 items (up to ~7 years old)
```

Any threshold placed between 24h and 70h produces the same split — 2
items pass, 17 don't — because nothing in the real data falls in that
range. This is the basis for choosing **48 hours** specifically: it
sits inside that natural gap, and matches a familiar, explainable unit
("two days") rather than an arbitrary-looking number pulled from
nowhere in the data.

A second finding shaped this document just as much as the age gap:
**every item with `classification_confidence = 0.4` was 70+ hours
old** (three of them ~199 days old). The value 0.4 never once
appeared on a fresh item. This is why V2 does not treat `0.4` as a
meaningful probability ("the system is 40% sure") — it behaves like a
static fallback value a stale pipeline run leaves behind, not a
graded editorial signal. V2 keeps using it as an input (the existing
Review Queue cutoff, `< 0.5`, is not being second-guessed here), but
stops treating its exact value as informative beyond that yes/no
cutoff.

## V2 qualification rule for `low_confidence`

**Old (V1):**
```
classification_confidence < 0.5  →  action_required
```

**New (V2):**
```
classification_confidence < 0.5
    AND
story age < 48 hours
    →  action_required
```

Both conditions are required. `48 hours` is a **qualification gate** —
a yes/no cutoff on whether the signal is even eligible to reach an
admin — not a score, not a ranking input, and not blended with
confidence into a combined number. This directly continues the
Editorial Attention Model's original rejection of a second ranking
system (`docs/editorial-attention-model-v1.md`, Model C) — the gate
adds a second *filter dimension*, not a second *score*.

`story age` is measured the same way the production simulation already
computed it: time since the canonical `rss_items.published_at` for the
story's cluster (the earliest member, per the same resolution
`reviewQueueAdapter.js` already uses for `publishedAt`) — no new
timestamp source is introduced.

## What happens to the 17 stale items

Per ChatGPT's explicit instruction, restated as a hard constraint:

- **Not deleted.** No `DELETE`, no table change.
- **Not expired.** No `expires_at` write, no lifecycle state change.
- **Not reclassified.** `classification_status` and `field` are
  untouched.
- **Only excluded from the Attention Layer's output.** They remain
  exactly as queryable via the Review Queue and any other existing
  surface as they are today — V2 changes what one *derived, read-only*
  evaluator returns, nothing about the underlying data.

Whether these 17 (and future items like them) should eventually be
archived, expired, or otherwise cleaned up is **a separate, undecided
product question** — explicitly out of scope here, consistent with
`docs/retention-policy-design-v1.md`'s own framing that retention
eligibility and deletion authority are not the same thing.

## The other two signals — unchanged

- **`source_failure`**: stays exactly as V1 defined it — an aggregate
  count from `operational_snapshots_public.failed_sources_count`,
  `informational`, never a fabricated per-source name. No age
  qualification applies (there is no meaningful "age" for a same-day
  aggregate count).
- **`pin_expiring`**: stays exactly as V1 defined it — a 6-hour window
  (`PIN_EXPIRING_WINDOW_HOURS`, `editorialAttentionConfig.js`) over
  active, unexpired `story_overrides` pins, `informational`. No change.

Both signals are unaffected by this document — V2 is scoped
specifically to fixing `low_confidence`'s over-broad qualification,
not a rewrite of the whole model.

## What this document does NOT do

- No code, no component, no route
- No change to the classifier, to `classification_confidence`'s
  computation, or to the existing 0.5 Review Queue cutoff itself
- No retention, expiry, or lifecycle change to the 17 stale items or
  any future item like them
- No UI, no Digest integration, no Review Queue change
- Does not implement the adapter change — that is the next step, after
  this document is reviewed

## Next

Awaiting review. Per ChatGPT: once approved, update
`editorialAttentionAdapter.js`'s `low_confidence` evaluation to the V2
qualification rule, then re-run the same read-only production
simulation (`db/simulate-editorial-attention-production.mjs`,
unmodified) against real data. Target: 19 → approximately 2. If V2
produces a small, defensible number on real production data,
integration toward "Hari Ini" becomes worth considering; if not, the
model gets narrowed further before any UI work begins.
