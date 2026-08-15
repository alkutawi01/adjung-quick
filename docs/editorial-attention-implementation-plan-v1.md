# Editorial Attention — Implementation Plan v1 (2026-08-16)

Status: `[x] Plan` `[ ] Approved` — **no code, no UI, no Digest change**

FASA 4.3, per ChatGPT's instruction after `docs/editorial-attention-model-v1.md`
was approved: that document defined the Informasi/Keputusan distinction
and recommended Model B (rule-based attention). This document answers
how that model actually enters the existing system — checked against
real code, not assumed — before anything gets built.

## 1. Signal source, verified against real code

Per ChatGPT's explicit instruction — "pastikan tiada AI magic baharu"
— every signal below was checked directly against the codebase, not
assumed from the attention model doc's proposal:

| Signal | Sumber sebenar | Sudah wujud? |
|---|---|---|
| Confidence rendah | `edition_story_classifications.classification_confidence`, queried in `fetchReviewQueue()` (`ui/src/admin/reviewQueueAdapter.js:35-37`), threshold hardcoded `< 0.5` | **Ya, sepenuhnya** — already computed, already surfaced as `reasonCode: 'low_confidence'` |
| Konflik classification | — | **Tidak wujud.** `reviewQueueAdapter.js:16-18` explicitly documents this as unbuilt: only `low_confidence` and `no_evidence` reason codes exist. `content_mismatch`/conflict detection has no logic anywhere in the codebase — this was aspirational in the attention model doc, not real today |
| Sumber gagal | `operational_snapshots.failed_sources_count` (`db/schema-operational-snapshots.sql:29-37`), an aggregate daily count from `db/daily-observation.mjs` | **Separuh** — the count exists, but only as an aggregate. No per-source identity, no error detail, no live health flag — just "N sources failed today" |
| Pin akan tamat | `story_overrides.expires_at TIMESTAMPTZ NOT NULL` (`db/schema-editorial-state.sql:39`) exists and is indexed | **Separuh** — the column exists, but today it's only used to *exclude* expired/active overrides from queries (`reviewQueueAdapter.js:79`, `.gt('expires_at', ...)`). No "expiring soon" window computation exists anywhere |
| Anomali pipeline | `operational_snapshots` stores four raw counters (`stories_processed`, `review_queue_count`, `failed_sources_count`, `active_override_count`) | **Tidak wujud.** No anomaly-detection logic — no thresholds, deltas, or trend computation anywhere in `db/daily-observation.mjs`. The schema's own documentation states this data answers "what happened," explicitly never "what's wrong" |

**Consequence, stated plainly**: only 1 of the 5 rules named in
`docs/editorial-attention-model-v1.md` is fully real today (low
confidence). Two are half-real (source failure as an aggregate only,
pin expiry as a column with no "soon" computation). Two are not real
at all (classification conflict, pipeline anomaly) — both were named
in the attention model doc as *plausible future signals reusing
existing infrastructure*, but checked against real code, that
infrastructure computes raw counts, not the derived signal the
attention model assumed. **This document does not propose building
detection logic for the two missing signals** — that would be new
"AI magic," exactly what this document exists to rule out. It instead
scopes what the attention model can honestly implement *today*.

## 2. What the Attention Layer implements now vs. defers

| Rule | Status this phase |
|---|---|
| Confidence rendah | **Implement** — data fully exists, this is a filtering/framing change only |
| Sumber gagal | **Implement, with an honest caveat** — surfaces "N sources failed" as an aggregate count, not per-source detail (matches what `failed_sources_count` actually is) |
| Pin akan tamat | **Implement the simple case** — a fixed window computation (`expires_at` within N days) is a small, well-scoped addition to an existing query, not new signal infrastructure — this is deriving a view over existing data, not detecting something new |
| Konflik classification | **Defer** — no detection logic exists; building it is a separate, larger scope (classification-pipeline work, not an attention-layer concern) not authorized by this document |
| Anomali pipeline | **Defer** — same reasoning; `operational_snapshots`' raw counters could theoretically support anomaly detection later (e.g. comparing today's `failed_sources_count` against a trailing average), but that's a real analytical feature to design deliberately, not something this document should smuggle in as a side effect |

This directly narrows Model B's rule list from 5 to **3 real rules for
this phase** (confidence, source failures, pin expiry), with the other
2 named as a future, separately-scoped addition once real detection
logic exists for them — not silently dropped, not silently built.

## 3. Attention object — data shape

Per ChatGPT's explicit question: derived-only, not a new table.

```
AttentionItem {
  type: 'low_confidence' | 'source_failure' | 'pin_expiring'
  severity: 'info' | 'decision'   // per the Informasi/Keputusan split
  reason: string                  // human-language, same discipline as
                                   // ReviewQueueCard's displayReason —
                                   // never a raw score or code
  related_story_id: string | null // null for source_failure (not
                                   // story-scoped)
  recommended_action: 'reclassify' | 'hide' | 'renew_pin' | null
}
```

**Derived, not stored.** Per the retention policy's own principle
(`docs/retention-policy-design-v1.md`) and the classification
reconciliation direction (`docs/classification-lifecycle-reconciliation-design-v1.md`)
— `story_clusters`/`edition_story_classifications`/`story_overrides`
remain the sources of truth. An `AttentionItem` is a computed view
over them at request time (same pattern `fetchReviewQueue` already
uses), not a new persisted entity. This avoids a second data model
that could drift out of sync with the tables it's summarizing —
exactly the kind of duplicated-truth problem FASA 4.2's classification
lifecycle work exists to prevent elsewhere in this project.

**No audit requirement** — because nothing is stored, there's nothing
to audit. If an `AttentionItem` needs to be *acted on* (e.g. an editor
hides a low-confidence story), that action already goes through
`story_overrides`, which already has full audit coverage
(`created_by`, `reason`, `created_at`). The attention layer itself is
read-only summarization, not a new source of state.

## 4. Relationship with Digest

Per ChatGPT's own framing, restated as the binding rule: **Digest
bukan sumber kebenaran baharu — ia hanya presentation.**

```
existing signals (classification_confidence, failed_sources_count,
expires_at)
       ↓
attention evaluation (the 3 implementable rules from §2, computed
at request time)
       ↓
Digest (presentation only)
```

`AdminDigest.jsx`'s existing shape (`processed`, `needsAttention`,
`actionsToday`, `noActionNeeded`) does not need new fields — only
`needsAttention`'s underlying query changes, from "raw Review Queue
count" to "count of `AttentionItem`s with `severity: 'decision'`."
This is the direct implementation of `docs/editorial-attention-model-v1.md`
§5's already-stated direction — this document doesn't add a new
requirement, it specifies how to satisfy the existing one without
inventing new state.

## 5. Relationship with Review Queue

Per ChatGPT's explicit question — not every `AttentionItem` routes to
Review Queue:

```
AttentionItem (type: 'low_confidence')
        ↓
Review Queue (existing surface — this IS what Review Queue already is)

AttentionItem (type: 'pin_expiring')
        ↓
Editorial Decision (a different surface — not a classification
review, a renewal decision)

AttentionItem (type: 'source_failure')
        ↓
Neither — this is operational, not editorial. Surfaces in Digest as
information, has no "act on this story" affordance at all, since it
isn't about a story
```

**Consequence**: Review Queue's existing scope and query stay
unchanged (`low_confidence`/`no_evidence` reason codes, as they are
today) — it becomes one of potentially several *destinations* an
`AttentionItem` can route to, not a redesign of what Review Queue
itself does. `pin_expiring` items are the first concrete evidence that
Keputusan Editorial (not Review Queue) is where a `pin_expiring`
attention item's "renew" action would eventually live, once Pin has a
real surface.

## 6. Threshold management

Per ChatGPT's explicit instruction — don't pick numbers, decide
ownership first:

| Threshold | Current state | Recommendation |
|---|---|---|
| Confidence cutoff (`< 0.5`) | Already hardcoded in `reviewQueueAdapter.js:37` | **Leave as-is for this phase.** It's an existing, working threshold — changing its *value* is out of scope here; this document only proposes reusing it as an `AttentionItem` signal, not retuning it |
| "Pin expiring soon" window (e.g. N days) | Does not exist yet — new to this phase | **Config, not hardcode, and not database.** A fixed constant in application config (similar to how `state/rankingFlags.js` is a static per-edition/field config file, not a database table) — this is a single global window, not a per-story or per-editor setting, so a database table would be over-engineered for what this actually needs. Hardcoding directly in a query would repeat the same "silent behavior change" risk ChatGPT flagged — a named, greppable config constant is the middle ground |
| Source-failure "worth surfacing" count | Does not exist yet — currently `failed_sources_count` is shown raw, no threshold | **Defer.** Per §2, source failure surfaces as a raw aggregate count for this phase — no threshold decision is needed until per-source detail (§1's "separuh" finding) is designed, which this document explicitly does not do |

**Ownership principle stated once, applying to all three**: any
threshold that changes *what an admin sees* must live in a named,
version-controlled config location (a file, not a runtime-editable
database value) for this phase — matching FASA 4.2's own "no silent
behavior change" discipline applied to migrations. A future admin-editable
threshold UI (per `docs/adjung-core-visual-settings-panel-kiv.md`'s
already-named pattern for other config) is a legitimate future
direction, not decided or built here.

## What this document does NOT do

- No code, no component, no route
- No new detection logic for classification conflict or pipeline
  anomaly — both explicitly deferred, not built
- No change to `AdminDigest.jsx`, `reviewQueueAdapter.js`, or any
  shipped file
- Does not implement the "pin expiring soon" window computation —
  scopes it as implementable, doesn't write it
- Does not choose the exact confidence/expiry threshold *values* where
  new ones are needed (the expiry window) — names where that decision
  should live (config), not what the number should be

## Next

Awaiting review. Per ChatGPT's own framing: after this document, the
real decision becomes answerable — does Pin need (A) a full story
picker, or (B) a short "berita yang layak dipertimbangkan" list drawn
from the Attention Layer. Given only 3 of 5 original rules are
implementable now, and `pin_expiring` is one of them, Option B is more
directly supported by what's actually real today than it was before
this document — but per ChatGPT's own instruction, not locked here.
