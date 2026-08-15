# Old Table Lifecycle Policy v2 (2026-08-15)

Status: `[x] Design` `[ ] Approved` — **governance only, no multi-generation implementation**

FASA 4.2 follow-up #2, per ChatGPT's instruction: v1 of this policy
(`docs/ingestion-staging-swap-implementation-plan-v1.md` §4b) already
established the core rule — `_old` is dropped manually, never
automated or time-based, gated on a verification checklist. v2 answers
four sharper questions v1 left implicit, surfaced by this session's own
real experience running the mechanism twice. Per ChatGPT's explicit
instruction: **governance only — do not design multi-generation
storage implementation here.**

## 1. When can `_old` be dropped?

Unchanged from v1, restated precisely: **only after every item in v1's
six-point verification checklist holds, AND the Classification
Lifecycle Reconciliation direction (`docs/classification-lifecycle-reconciliation-design-v1.md`)
is itself implemented and proven** — because dropping `_old` is a
one-way step, and "the new generation is trustworthy" (that document's
whole subject) has to be true before committing to it permanently, not
just "the new generation swapped in without error." A swap succeeding
and a swap being *correct* are different claims; v1's checklist mostly
tests the former, the Classification Lifecycle contract is what tests
the latter.

## 2. How many generations can exist?

**Exactly one `_old` generation at a time — this is a hard limit for
V1, not a preference.** `swap_ingestion_staging()` already enforces
this by refusing to run while any `_old` table exists
(`db/schema-ingestion-staging-functions-v1.sql`) — confirmed as a real,
load-bearing constraint this session, when it correctly blocked a
second production swap because the first generation's `_old` was still
protected by the (then-active) observation window. That wasn't a bug
to route around; per ChatGPT's own framing, it's the guard "doing its
job exactly as designed."

**Multi-generation retention is named as a future direction, not
decided or designed here.** A scheme like
`production_backup_20260815`, `production_backup_20260820`, … would
let ingestion continue running while still keeping more than one
rollback point — genuinely useful for long-running operation — but
introduces real new questions (how many generations, on what
schedule are older ones pruned, does every generation need its own FK
repoint) that deserve their own design pass once V1's single-generation
model has actually been observed under real operating conditions. Per
ChatGPT: *"Jangan terus fikir multi-generation implementation. Cukup
governance dahulu."*

## 3. What conditions must hold before DROP?

Restating v1's checklist as explicit preconditions, unchanged in
substance, clarified in framing — these are AND conditions, not a
scored checklist:

1. The swap that produced the current `_old` committed successfully
   (never silently rolled back)
2. Reader surfaces normal: `/`, edition switching, the Active Set
3. Admin surfaces normal: Review Queue, Digest, Timeline
4. Editorial state intact: `story_overrides`/`saved_stories`/
   `history_entries` rows from before the swap still resolve to real
   `story_clusters` rows
5. At least one full subsequent ingestion cycle has also succeeded
   (proves the mechanism, not just one lucky run)
6. No FK/reference anomaly observed at any point
7. **New in v2**: the Classification Lifecycle Reconciliation
   direction (§1 above) is implemented, not just designed — an
   unimplemented design doesn't protect anything

None of these are individually sufficient; all must hold together.

## 4. Rollback window

**No fixed time bound — unchanged from v1, restated for emphasis
because this is the point ChatGPT flagged as the actual insurance
value of the whole mechanism.** `_old` stays until a human explicitly
runs the drop script after confirming §3 above. The current
observation window (16–20 Ogos) is a *minimum* hold, not the trigger —
if any §3 condition is still unmet on 20 Ogos, the hold continues past
that date. Observation ending is necessary but not sufficient for a
drop decision.

**What "rollback window" actually protects against**, named
explicitly since it's easy to lose sight of: not just "the swap itself
was wrong" (staging validation already catches gross errors before a
swap ever commits) but *slow-to-surface* problems — a classification
mismatch that only appears after the next classify run, a reader
report that takes a day to reach an admin, an editorial override that
silently stops resolving. Time-based auto-drop is specifically wrong
because it drops `_old` at the exact moment these slower signals are
still arriving.

## What this document does NOT do

- No multi-generation retention scheme designed or built
- No change to `swap_ingestion_staging()`'s single-generation guard
- No code, no migration
- Does not shorten or waive any part of v1's original checklist —
  only adds one precondition (§3.7) and clarifies the generation limit
  (§2)
- Does not decide when the current observation window's `_old` will
  actually be dropped — that's a future, evidence-based decision, not
  a date

## Next

Per ChatGPT's stated order: Retention Policy is the third and final
FASA 4.2 follow-up document, after this one is reviewed.
