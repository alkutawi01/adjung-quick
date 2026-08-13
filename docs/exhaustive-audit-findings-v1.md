# Exhaustive Codebase Audit — Findings v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[x] Implementation pending` `[ ] Closed`

## Triage (per ChatGPT, 2026-08-13) — this opens FASA 2.5

Per ChatGPT: this audit is real enough to warrant its own sub-phase —
**FASA 2.5 — Production Safety & Product Reliability Review** — running
alongside FASA 2's Editorial Correctness work, not replacing it.

**Fixed now** (isolated, no design decision, verified live):
- ✅ `ui/src/components/StoryCard.jsx:95` (CRITICAL) — touch tap now opens
  directly; mouse behavior unchanged. Verified live: touch dispatch opens
  the Brief, mouse dispatch only highlights.
- ✅ `ui/src/components/TopicWheel.jsx:174` / `StoryCard.jsx` (HIGH) —
  drag gestures now scoped by `pointerId`; a second concurrent touch is
  ignored outright instead of corrupting shared drag state. Verified
  live: a simulated interfering second touch during an active swipe no
  longer disrupts the first finger's release.
- ✅ `ranking/candidate-scoring.mjs:28` (HIGH) — `freshnessScore()` now
  degrades to 0 instead of crashing on a missing/unparseable
  `publishedAt`.
- ✅ `state/reducer.js:195` editorial_v1 test gap (HIGH) — added TEST 10
  in `state/test.js`, pinned explicitly to `ms-MY`/Politik so the one
  production-active ranking path is actually exercised, not skipped.
- ✅ `package.json:12` (LOW) — wired `db/edition-representation-eligibility.test.mjs`
  and `db/production-classification-acceptance.test.mjs` into `npm test`
  (both were already passing, zero behavior change).

All fixes committed, 129 assertions across 9 suites passing.

**Frozen — needs design review before any change** (per ChatGPT, explicit):
- ❌ `db/ingest-production.js:74,59` (CRITICAL) — the destructive-rebuild
  guard's safety model itself needs redesigning, not patching. **Do not
  run production ingestion until this is resolved.** Needs
  `docs/ingestion-safety-guard-v2-decision.md` (fail-closed on query
  failure, transaction boundary, partial-failure handling, emergency vs.
  normal-refresh distinction).
- ❌ `db/ingest-production.js:78`, `db/ingest-production.js:80-82`,
  `db/classify-production.js:152` (HIGH) — truncate-then-refill pattern.
  Real fix is an atomic swap / staging table / versioned dataset, not a
  try/catch. Folds into the same ingestion-lifecycle design work as the
  guard above (`docs/ingestion-lifecycle-v2-design.md`, already started).
- ❌ `ranking/diversity-selection.mjs:20` near-duplicate check (HIGH) —
  do not touch the algorithm. Next step: reproduce the failing test,
  understand why, assess live impact — decision after that, not before.
- ❌ `ui/src/style.css:271` Active Set no-scroll clipping (MEDIUM) — the
  "no scroll, fits one screen" constraint is Izzat's own product rule;
  needs a design decision, not a CSS patch.
- ❌ RTM feed overlap / taxonomy items (MEDIUM/DECISION) — editorial
  calls, not code changes.

**Backlog** (LOW/IMPROVEMENT, no urgency): remaining CSS/RTL items, JAKIM
fetch-path redirect/gzip handling, MOSTI cert monitoring, BBC http://
URL, accessibility gaps, script/style-content stripHtml edge case.

Category: **Architecture & Risk Audit** (per ChatGPT's classification — not
feature development; read-only, no production/ranking/classification
behaviour changed). Produced by a 5-dimension multi-agent audit (47
agents total), every finding independently re-verified against the live
code before inclusion here.

**Per ChatGPT's explicit instruction: findings only. No implementation
until reviewed and classified.** Each item below is tagged:

```
[BUG]         — confirmed defect, safe to fix without a design decision
[RISK]        — confirmed defect, needs a design/architecture decision first
[IMPROVEMENT] — real but low-stakes, backlog-worthy
[DECISION]    — not a bug per se, needs Izzat/ChatGPT to decide something
```

37 confirmed findings, 4 raised-but-refuted during adversarial
verification (discarded, not listed).

---

## CRITICAL (3)

**[RISK] `db/ingest-production.js:74`** — The `ALLOW_DESTRUCTIVE_REBUILD=true`
override built this same session doesn't do what its own comments
promise. It's meant for the moment a reader has saved a story — but the
delete it forces will actually be **rejected by the database itself**
(the foreign key has no ON DELETE action), the error is never checked,
and the script silently limps into a confusing crash, leaving the DB
half-migrated (sources wiped+reinserted, story_clusters/rss_items
stale). *Needs review — the guard's safety model needs redesigning, not
patching.*

**[RISK] `db/ingest-production.js:59`** — The same guard's own safety
check silently treats a failed database read as "0 rows, safe to
proceed" (the `error` from the count query is never checked). This can
defeat the finding above without anyone noticing. Same redesign, same
review.

**[BUG] `ui/src/components/StoryCard.jsx:95`** — On phones, tapping a
story only highlights it — actually opening it to read requires a
double-tap, which is unreliable on real touchscreens and has no visual
hint it's needed. The product's own spec calls for single-tap-to-open on
touch; the code never checks touch vs. mouse at all. **The core "open
and read a story" action can be effectively broken for touch-only
readers.** Straightforward fix, no design decision needed.

---

## HIGH (7)

**[BUG] `db/ingest-production.js:80-82`** — Deletes run in the wrong
order for one table's foreign key (rss_items before story_clusters);
currently masked by accident (a later delete cascades and cleans it up
anyway). If that cascade config ever changes, this breaks silently.

**[RISK] `db/ingest-production.js:78`** — Every ingestion run empties
then slowly refills the exact tables the live site reads on every page
load. With real visitors now on adjung-quick.vercel.app, this is a real
(if brief) "site shows zero stories" window on every content refresh.
Proper fix is an atomic swap, not a quick patch — needs a design
decision.

**[RISK] `db/classify-production.js:152`** — Same pattern for
classifications: `--write` empties the field-labels table before
refilling it in batches; a visitor loading mid-window sees every story
unclassified. Same atomic-swap decision as above.

**[RISK] `ranking/diversity-selection.mjs:20`** — The "avoid near-duplicate
headlines" check is too aggressive: it's currently **failing the
project's own regression test**, wrongly treating two different stories
as duplicates because they share generic phrasing, and dropping a real
story. **Already live for ms-MY/Politik.** Touches the frozen ranking
engine — needs review, not a reflexive patch.

**[RISK] `ranking/candidate-scoring.mjs:28`** — The freshness-scoring
function crashes outright (not a bad score — a hard crash) if a story's
published date is missing/unparseable, which would take down ranking for
an entire edition/topic. Currently shielded by upstream data cleaning
only. Fix itself is low-risk (default to 0 instead of crashing), but
touches the ranking engine.

**[BUG] `ui/src/components/TopicWheel.jsx:174`** — The topic wheel and
story-swipe gestures don't handle two fingers touching at once (stray
touch, palm edge). A second touch during a drag can corrupt gesture
state, causing an unintended topic change or story dismissal.
Straightforward fix (track by pointer ID), no design decision needed.

**[BUG] `state/reducer.js:195`** — The one production-active advanced
ranking path (ms-MY/Politik) is never actually exercised by the test
suite — tests pick whichever topic has the most stories, and Politik
usually isn't it. A bug here would ship completely undetected. Fix: pin
a test to Politik explicitly.

---

## MEDIUM (16)

**[RISK] Production data safety**
- `db/identity-test.js:149` — no cleanup safety net; a crash mid-run
  leaves test rows that trip the production-rebuild guard and block real
  ingestion. Fix: wrap cleanup in try/finally.

**[DECISION] RSS source reliability**
- `lab/sources.js:78` (RTM feeds) — 4 of RTM's 6 category feeds
  (dunia/jenayah/hiburan/ekonomi) share large chunks of the *same*
  stories, each asserting a different topic. Deduplication elsewhere
  mostly catches this, but ties resolve arbitrarily (first-in-array
  wins). Scales up the already-known issue in `docs/known-issues.md` #3.
  Needs an editorial call on which RTM feed to trust — not a code patch.
- `docs/source-intelligence-readiness-audit-v1.md:35` — the 4 RTM feeds
  flagged for review are still untouched, and the doc's JAKIM status
  note is now stale (JAKIM was fixed the same day this doc was last
  read). Just needs a doc update.

**[IMPROVEMENT] Source fetch robustness**
- `lab/rss.js:146` — the JAKIM-only TLS-workaround fetch path doesn't
  follow HTTP redirects, unlike every other source. Fine today; latent.
- `lab/rss.js:152` — same JAKIM-only path doesn't handle gzip-compressed
  responses. Fine today; latent.

**[RISK] Classification & ranking engine**
- `classification/lib/content-rules.mjs:54` — the HTML-stripping
  function (built this session to fix a real incident) has three
  remaining gaps: a stray `>` inside an attribute leaks text early;
  legitimate `<`/`>` used as math symbols in prose (e.g. "untung < 5%")
  erases real words; a tag truncated mid-attribute isn't stripped at
  all. Same bug family as the already-fixed vaccine-keyword incident.
  Touches the frozen classification engine — needs review.
- `classification/lib/confidence-policy.mjs:58` — for Disaster/
  Environment/Health, this session's per-subject override silently
  ignores the threshold value the benchmark tool passes in, so sweeping
  0.40–0.80 to tune classification has zero effect on those 3 subjects.
  Doesn't affect live classification (production never passes that
  override) — only undermines the tuning tool's own results.

**[BUG] Mobile UI**
- `ui/src/style.css:240` — the Arabic edition's wheel labels render
  left-aligned (should be right-aligned) and the selection animation
  anchors from the wrong side. Reproducible on every load of ar-global.
  Standard RTL CSS fix.
- `ui/src/style.css:162` — the wheel assumes every label is one line;
  two-word Malay labels ("Alam Sekitar") can wrap at larger accessibility
  text sizes, throwing off spacing math for everything below. Needs a
  small layout rework.
- `ui/src/style.css:271` — story list has fixed equal-height rows with no
  scrolling anywhere (by design — Izzat's own "no scroll, fits one
  screen" rule). At larger text sizes or a full 10-slot topic, content
  can be silently clipped with no indication. **Needs a design
  decision** — the "no scroll" constraint itself is the root cause.
- `ui/src/style.css:213` — wheel has a fixed height with no adjustment
  for short screens (landscape phone, split-screen). Needs a responsive
  rule.

**[IMPROVEMENT] Test coverage**
- `state/reducer.js:197` — the one place that runs the ranking engine
  over the *entire* candidate pool (not just 10 slots) is completely
  untested, though genuinely live for ms-MY/Politik.
- `ranking/ranking-engine.test.mjs:128` — currently failing (2/11
  checks), not wired into `npm test`, so invisible to routine testing.
  Same underlying bug as the diversity-selection HIGH item above.

---

## LOW (11)

- `db/sample-ingest-verify.mjs:93` — same missing-cleanup pattern as
  identity-test.js, lower impact (not reader-visible, self-cleans).
- `lab/sources.js:45` — BBC World is the only source using `http://`
  instead of `https://`; works today only because BBC redirects.
  One-line fix.
- `lab/sources.js:122` — MOSTI uses the same certificate vendor that
  just caused the JAKIM outage — not broken, worth watching.
- `classification/lib/content-rules.mjs:54` — a narrower HTML-stripping
  gap (script/style tag *contents* survive); tested against 9 real feeds,
  none currently trigger it.
- `ranking/diversity-selection.mjs:21` — title-comparison would crash on
  a missing title; fully shielded upstream today, defensive gap only.
- `classification/test-edition-classification.mjs:19` — standalone
  diagnostic script crashes on old edition names (`en`/`ar` vs
  `en-global`/`ar-global`). Doesn't touch production.
- `ui/src/style.css:170` — wheel's up/down nav buttons render under the
  recommended minimum tap size.
- `ui/src/components/TopicWheel.jsx:259` — no screen-reader announcement
  when the selected topic changes.
- `package.json:12` — two working, currently-passing test files
  (edition-eligibility, classification-adapter) aren't in `npm test`, so
  future regressions there wouldn't be caught automatically.
- **Verified clean, no action needed**: no duplicate source IDs/URLs
  across all 43 RSS sources; fetch timeout/retry/User-Agent settings
  consistent across all sources.

---

## Overall shape

The two most urgent items: (1) the destructive-rebuild safety net for
production data — built earlier this same session — doesn't actually
work as documented, and needs a design pass before it can be trusted;
(2) touch-only phone readers may not be able to open a story at all —
same-day, low-risk fix.

Everything touching `classification/` or `ranking/` is tagged for review
rather than a quick patch, per this project's standing rule: no
reflexive changes to the frozen classification engine or production data
without sign-off — especially since no reliable database backup exists
(`docs/restore-rehearsal-v1.md`).

**No implementation has been done.** Awaiting review and classification
per ChatGPT's instruction before any fix proceeds.
