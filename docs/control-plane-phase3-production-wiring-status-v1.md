# Fasa 3 Production Wiring — Final Status

Per ChatGPT's explicit decision after Step 6 (live temporary-rule proof)
was found to require either a full-corpus `--write` or a new scoped
mechanism, and both were rejected as disproportionate to a proof-only
purpose.

## Status: NOT "CLOSED" — accurately labeled instead

| Component | Status |
|---|---|
| Schema (`classification_rules`) | 🟢 |
| RPC (add/archive/restore) | 🟢 |
| Resolver (`resolveClassificationRule`) | 🟢 |
| Admin Read-Only UI | 🟢 |
| Production wiring (`classify-production.js` fetches + passes rules) | 🟢 |
| Integration test (real call-site combination, zero mocks) | 🟢 |
| No-rule parity (byte-identical dry-run vs. pre-wiring baseline) | 🟢 |
| Live rule effect on a real production classification | 🟡 **UNVERIFIED** |

**Overall: implemented + strongly verified, live rule activation pending.**
Not labeled CLOSED — per ChatGPT: "jangan memaksa label CLOSED... itu
lebih jujur terhadap bukti yang kita ada."

## Why Step 6 was deferred, not forced through

Proving live rule activation today would require one of:

- **(A) A full-corpus `classify-production.js --write`** — truncates and
  rewrites all of `edition_story_classifications` (691 clusters) to
  prove a single narrow rule. Rejected: even though the *content* change
  would be scoped to one low-volume source, the *operation* is a full
  production rewrite — disproportionate for a proof, with no
  rollback/atomicity mechanism beyond "run it again."
- **(B) A new scoped/single-story write primitive** — confirmed via
  read-only fact-finding that none exists today (checked
  `classificationFlowAdapter.js` — read-only; the "reclassify" override
  in `reviewQueueAdapter.js` — writes to `story_overrides`, an entirely
  different mechanism that never touches `classification_rules` or
  `classifyForAllEditions()`; `backfill-taxonomy-codes.mjs` — patches
  `field_code`/`subject_code` retroactively, doesn't run classification
  logic; all `audit-*`/`generate-batch-*`/`benchmark-*` scripts — in-memory
  only, never write to DB). Rejected: building one now would be
  "overengineering... membina feature semata-mata untuk menguji
  feature."

## The deferred path forward

Live rule activation proof is deferred until **the first legitimate
production classification rule is actually needed** — at that point, the
full-corpus rewrite is a real product operation, not a test artifact, and
can double as the live proof, provided (per ChatGPT):

- baseline/backup recorded first,
- expected affected scope defined in advance,
- parity confirmed for all unaffected stories,
- rollback/recovery path clear,
- provenance (`classification_method = 'admin_rule'`) verified.

## Architectural note (per ChatGPT, worth keeping)

The full truncate+rewrite is not necessarily a design flaw:
`edition_story_classifications` may correctly be a **materialized output**
rebuilt from source data + taxonomy + rules, not a table meant for
incremental single-row updates. At 691 clusters, there's no evidence this
is a bottleneck — building an incremental-invalidation mechanism now
would be optimizing something never proven to need it.

## What did NOT happen

- No `--single-story` flag, temporary RPC, or test-only production path
  was added.
- No live production data was touched for this proof attempt.
- No code was changed after the fact-finding step confirmed no existing
  primitive fits.

Next: return to Control Plane Completion Audit v2's remaining items
(desk-vocabulary, content-rules, bernama-prefix, confidence-policy,
edition-rules, candidate-scoring) — per ChatGPT, without assuming any of
them automatically need to move to the DB.
