# Known Issues Ledger (2026-08-12)

Status: living document. Findings recorded here on discovery are things
we've deliberately chosen NOT to fix immediately — either because one
sample isn't enough to justify a rule change, or because the fix belongs
at a different layer than the one that surfaced the symptom. Per ChatGPT:
don't repair on a single case; collect samples first.

## 1. KPM feed mixes news with administrative notices (FILTERED)

Found during the Real Classification Snapshot sanity sample after the
Production Evidence Persistence Gap fix's first full re-ingest
(`docs/production-classification-acceptance-test.md`): 116/309 (37.5%) of
`ms-MY` Pendidikan-classified stories were government tender/procurement
notices from `rss-kpm` (e.g. "Keputusan Tender Perkhidmatan Kawalan
Keselamatan..."), not education news.

This is not a classification bug — KPM genuinely is the Education desk, so
`source_known_category: 'pendidikan'` evidence was technically correct.
It's a content-quality problem: the ministry's RSS feed carries
administrative output alongside news, and treating the whole feed as
undifferentiated evidence pulls that noise into the reader-facing Wheel.

**Fix applied**: `lab/sources.js`'s `rss-kpm` entry now carries
`excludePatterns: [/tender/i, /sebut harga/i, /perolehan/i, /^notis\b/i]`,
enforced in `lab/rss.js`'s `parseRssXml()` before an item ever becomes a
cluster. Verified live: KPM's feed goes from 329 -> 193 items, 0 tender/
procurement titles remain.

Deliberately a **per-source** filter, not a classifier rule — same lesson
as the earlier mahkamah/menteri false-positive case (`docs/evidence-policy-v1-decision.md`):
"tender" reliably means procurement noise coming from a ministry feed, but
is not a safe general keyword (a real newsroom could legitimately cover a
tender scandal as news).

**Noted, not acted on**: the post-filter KPM sample still contains job
vacancy notices ("Peluang Kerjaya di...", "Hebahan Kekosongan..."). Not
added to `excludePatterns` — ChatGPT's instruction was scoped to the 4
patterns above (tender/sebut harga/perolehan/notis); this is a distinct
category and one observation isn't grounds for a new rule. Revisit if it
recurs at volume in a future sample.

## 2. "Technology overreach from defence policy" (NOT FIXED — collecting samples)

One story from `rss-kosmo` — "PSPN 2026-2030 Pacu Autonomi Strategik
Pertahanan Negara" (a defence-policy article, National Defence Strategic
Plan) — was classified `Teknologi` at confidence 0.7 in the same sanity
sample. Likely a keyword false-positive on "teknologi"/"autonomi"/
"strategik" appearing in defence-policy language.

Per ChatGPT: do not add negative keywords off a single case — this is the
same failure mode as the mahkamah/menteri lesson, just from the opposite
direction (over-pulling into a Bidang instead of under-pulling). Recorded
here as a known issue; collect more samples before deciding whether this
needs a source-level exclusion (like KPM above) or a classifier-level
adjustment (which would require re-opening the frozen engine — a much
higher bar).

**Status: open, unresolved, deliberately not blocking UI-2.**

## 3. RTM Category Feed Mismatch (Extended) — now confirmed on 2 feeds

**Affected**: `rss-rtm-sukan`, `rss-rtm-ekonomi`.

**Issue**: an RTM per-category feed's declared category
(`source_known_category`, Tier 1 evidence) does not always match the
actual subject of every item it publishes.

- `rss-rtm-sukan`: a car-crash death involving a student and a
  financial-aid announcement classified `Sports@0.9`
  (`docs/niche-field-coverage-audit.md`).
- `rss-rtm-ekonomi`: "Ribut Kristin ragut empat nyawa di Portugal" (a
  fatal storm — Bencana subject matter) classified `Economy@0.9`
  (`docs/niche-field-coverage-audit.md`'s Additional Coverage Findings,
  2026-08-13).

**Root cause**: not a classifier bug — Tier 1 evidence
(`source_known_category`) is doing exactly what it's designed to do
(fire with high confidence). The source registry's assumption that these
RTM feeds are narrowly single-subject is what's wrong, at least for some
items.

**Risk**: feed category metadata does not necessarily represent the real
subject of every item — Tier 1 evidence can cause false placement when
that assumption fails.

**Explicitly NOT done**: disabling `rss-rtm-ekonomi` or `rss-rtm-sukan`.
Per ChatGPT: it's unknown whether a feed is genuinely mixed-subject
throughout, or whether only a small fraction of items are mismatched —
disabling either source needs a precision audit first, not a reaction to
2 examples.

**Future improvement candidates (not now, next calibration cycle)**:
- **Source Intelligence Layer**: not all Tier 1 evidence should carry
  equal strength — a specialised newsroom's own category feed (e.g.
  Astro Awani's, already verified narrowly-scoped) is a stronger signal
  than a mixed government feed's category label.
- **Negative evidence**: detect when a source's declared category
  conflicts with the title's actual subject signal (e.g. "ekonomi"
  source label vs. a title that reads as disaster content) and treat
  that conflict as its own signal, rather than trusting Tier 1 blindly.

**Status: Open. No classifier change.**

## Source Content Profile (new concept)

Per ChatGPT: `excludePatterns` on a source entry in `lab/sources.js` is the
first instance of a broader **Source Content Profile** concept — sources
can carry configuration about their own content shape (what to trust,
what to filter), separate from both the classification engine (frozen)
and the edition taxonomy. Illustrative only for now; not a formal schema.
