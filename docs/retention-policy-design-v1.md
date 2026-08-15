# Retention Policy — Design v1 (2026-08-15)

Status: `[x] Design` `[ ] Approved` — **governance only, no cron cleanup, no DELETE script, no migration, no storage optimisation**

FASA 4.2 follow-up #3 (final), per ChatGPT's explicit instruction: one
retention policy covering everything would wrongly conflate different
functions under a single "delete old data" rule. This document
classifies three genuinely different data families, states each one's
purpose, and proposes a retention *direction* — it does not implement
deletion, and per the section below, it does not even grant automatic
deletion authority to anything.

## Retention is not deletion authority

Stated first because it's the single most important framing in this
document, named explicitly per ChatGPT's instruction, and grounded in
this project's own recent history (the destructive-rebuild finding,
the `_old` lifecycle, the generated-vs-editorial boundary FASA 3 and
4.2 both had to establish the hard way):

**A retention policy determines when data becomes eligible to be
considered for removal. It does not mean a scheduler automatically
deletes it.** No cron job, no auto-cleanup, no TTL-triggered DELETE is
proposed anywhere in this document. Every deletion this document's
policies eventually lead to (in a future implementation pass, not this
one) is a deliberate, reviewed, human-gated action — the same
discipline `production-write-guard.mjs` and the Old Table Lifecycle
Policy's manual-only drop already established for other destructive
operations in this project. This document sets the *criteria*; it
never sets the *trigger*.

## 1. Generated Content Data

**Tables**: `rss_items`, `story_clusters`, `edition_story_classifications`.

**What it is**: the news itself, and the system's automatic
understanding of it — regenerable in principle (a fresh ingest run
produces a new generation), but each specific row (this article, this
cluster, on this day) is not reproducible once gone. Deleting a
`story_clusters` row doesn't just free space; it erases the record
that a specific story existed and how the system classified it.

**Open questions this document does NOT answer**, per ChatGPT's
instruction to name them rather than assume:

- **Can old news be discarded at all?** Depends entirely on what
  Adjung Quick is: a live news window (only today's Bidang wheel
  matters, older content has no product purpose) or a de facto archive
  (readers or editors may want to search/reference past coverage). This
  is a product decision, not a technical one — not made here.
- **How long must a reader be able to find old content?** If the
  answer to the above is "archive," what's the actual window — a week,
  a month, indefinite? No answer proposed; this needs Izzat's product
  judgment, not an engineering default.
- **Is historical archive part of the product, or an operational
  byproduct?** If it's a real product feature, retention becomes a
  *feature* requirement (search, indexing, maybe even user-facing
  browsing) — very different scope than "keep some rows around for
  safety."

**Explicit rejection, per ChatGPT**: "old = useless" is not assumed
anywhere in this document. A story that rolled out of the RSS window
yesterday and a story from six months ago are not automatically
equivalent just because both are "old."

## 2. Editorial State

**Tables**: `story_overrides`, `source_overrides`.

**What it is**: not news content — a record of *human decisions* about
news content. This is categorically different from Generated Content
Data and needs its own policy, not a shared one, per ChatGPT's explicit
instruction.

**Why "the story is inactive" is not a deletion trigger**: a
`story_overrides` row hiding a story remains meaningful as an audit
record long after that story itself has expired or rolled out of
`story_clusters` — it answers "what did an editor decide, and why" long
after "what does the reader currently see" has moved on. Example, per
ChatGPT: an admin hides story X; seven days later the override's own
`expires_at` lapses and it stops affecting the reader; the *row itself*
is still useful as an audit trail of that decision. Deleting it the
moment it stops being reader-facing would erase editorial history for
no operational gain.

**Proposed direction (not decided, flagged for approval)**: retention
for this family should be measured in a materially longer horizon than
Generated Content Data — audit value doesn't expire the way content
relevance does. Exact duration (a fixed number of months? indefinite,
until an explicit archival decision?) is an open question, not answered
here.

## 3. Operational Observation Data

**Table**: `operational_snapshots`.

**What it is**: daily system-health numbers (per
`docs/operational-visibility-data-contract-v1.md`'s own core
invariant, restated here because it's directly relevant to retention
purpose: *"historical observation data — never editorial state, and
never a source of truth for reader-facing decisions. It answers 'what
happened,' never 'what should happen.'"*). Its entire value is trend —
"is this different from yesterday/last week" — not permanent record.

**Open questions**:
- **How long does a useful trend window need to be?** 30 days was
  informally mentioned as a candidate in earlier FASA 4.1 discussion,
  but never formally decided as a retention duration — only as the
  view's row-count bound (`operational_snapshots_public`'s `LIMIT 30`,
  which caps what's *exposed*, not what's *stored*). Whether stored
  history should also be capped at 30 days, kept longer for
  longer-range trend analysis, or kept indefinitely (it's small,
  structured data — storage cost is genuinely low) is not decided here.
- **Does this need an export/archive path** before older rows are ever
  removed (if they ever are), so long-range operational history isn't
  simply lost? Not decided — named so it isn't assumed away.

## Summary table — purpose, not just duration

Per ChatGPT's instruction: never propose a bare number of days without
stating why. This table names purpose first; specific durations remain
open questions above, not filled in here with placeholder numbers.

| Data | Purpose it serves | Retention character (not a number) |
|---|---|---|
| `story_overrides` / `source_overrides` | Editorial audit trail — who decided what, and why | Long — audit value persists well past the decision's operational relevance |
| `operational_snapshots` | Operational trend / system health signal | Moderate — bounded by how far back a meaningful trend comparison needs to reach |
| `rss_items` / `story_clusters` (old) | News content + the system's understanding of it | Needs product-level study — genuinely undecided whether "old" implies "discardable" here |
| `edition_story_classifications` (old) | Projection of the above — see `docs/classification-lifecycle-reconciliation-design-v1.md` | Follows `story_clusters`' own retention once that's decided — it has no independent lifecycle of its own, being a projection |

## What this document does NOT do

- No cron cleanup, no scheduled deletion job
- No DELETE script written or proposed for execution
- No migration
- No storage optimisation work
- Does not decide any retention *duration* — every number above is
  named as an open question, not filled in
- Does not grant any system automatic deletion authority — see
  "Retention is not deletion authority" above

## Next

Per ChatGPT: once this document is reviewed, **FASA 4.2's follow-up
design work is considered complete.** The next decision — whether to
begin implementing the Classification Lifecycle Reconciliation
contract, or to start the FASA 4.3 Editorial Desk requirements audit —
is made after this review, not assumed here.
