# Audit Closure Report v1 (2026-08-13)

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[x] Closed`

Category: **Closure document.** Per ChatGPT: before opening any new work
(Classification Observatory, taxonomy review, Fasa 3), close the audit
cycle formally — so this exact exercise doesn't need repeating in two
months because nobody wrote down what was decided.

This closes: `docs/exhaustive-audit-findings-v1.md` →
`docs/ingestion-safety-guard-v2-decision.md` →
`docs/production-data-lifecycle-v2-design.md` → this report.

**No new findings are opened by this document.** It only records what
happened to the 37 already found.

---

## A. Audit summary

| | |
|---|---|
| Method | 5-dimension multi-agent audit, adversarially re-verified |
| Agents | 47 |
| Findings raised | 41 |
| Refuted on verification | 4 |
| **Confirmed findings** | **37** |
| Fixed immediately | 5 |
| Frozen pending design | 8 |
| Backlog/improvement | 2 explicitly tagged, remainder (LOW severity items) implicitly backlog |
| Code touched | Read-only audit; 5 isolated fixes applied afterward, none touching classification/ranking/ingestion write paths |
| Production impact | Zero regressions — 129 assertions across 9 suites passing, live deploy verified (bundle hash confirmed, HTTP 200) |

### Fixed (5)

1. `ui/src/components/StoryCard.jsx:95` (CRITICAL) — touch tap now opens
   directly, mouse behavior unchanged
2. `ui/src/components/TopicWheel.jsx:174` + `StoryCard.jsx` (HIGH) —
   drag gestures scoped by `pointerId`, immune to a second concurrent
   touch
3. `ranking/candidate-scoring.mjs:28` (HIGH) — `freshnessScore()`
   degrades to 0 instead of crashing on missing/invalid `publishedAt`
4. `state/reducer.js:195` test gap (HIGH) — `state/test.js` TEST 10 pins
   `ms-MY`/Politik explicitly, so the only production-active ranking
   path is actually exercised
5. `package.json:12` (LOW) — 2 passing-but-unwired test files added to
   `npm test`

### Frozen pending design (8)

All tagged `[RISK]` or `[DECISION]` in `docs/exhaustive-audit-findings-v1.md`
— touch production writes, the ranking algorithm, or an editorial
decision, so none were patched reflexively:

1. `db/ingest-production.js:74` (CRITICAL) — destructive-rebuild guard
   doesn't behave as documented
2. `db/ingest-production.js:59` (CRITICAL) — guard fails open on a
   failed count query
3. `db/ingest-production.js:80-82` (HIGH) — delete order masks a real FK
   dependency by accident
4. `db/ingest-production.js:78` (HIGH) — truncate-then-refill causes a
   live "empty site" window
5. `db/classify-production.js:152` (HIGH) — same pattern for
   classifications
6. `ranking/diversity-selection.mjs:20` (HIGH) — near-duplicate check
   fails its own regression test; algorithm not touched pending
   reproduction + live-impact assessment
7. `ui/src/style.css:271` (MEDIUM) — Active Set no-scroll clipping;
   Izzat's own "fits one screen" rule is the root constraint
8. RTM feed overlap / taxonomy items (MEDIUM/DECISION) — editorial
   calls, not code

---

## B. Architectural decisions locked

These now stand as project rules — future work should be checked
against them, not treated as one-off findings:

1. **Generated Data ≠ Editorial State.** A table the pipeline
   regenerates can never be where a human decision is stored.
   (`docs/editorial-override-data-model-v1.md`, generalized project-wide
   in `docs/production-data-lifecycle-v2-design.md`.)

2. **User state cannot be silently deleted by a content refresh.** Any
   write path that touches `story_clusters` must account for
   `saved_stories`/`history_entries` referencing it — a refresh
   operation is not permitted to destroy what a reader owns, even
   indirectly. (`docs/ingestion-destructive-rebuild-finding.md`,
   `docs/ingestion-safety-guard-v2-decision.md`.)

3. **Human overrides live in their own, separate, durable storage** —
   never mixed into a generated table, never auto-expired except by
   their own designed rule (story-level expires with the story;
   source-level never auto-expires). (`docs/editorial-override-data-model-v1.md`.)

4. **A destructive rebuild is not a normal operation.** Routine content
   refresh and an emergency/deliberate rebuild must be two structurally
   different actions (different scripts, different confirmation), not
   one script with a bypass flag. (`docs/ingestion-safety-guard-v2-decision.md`.)

5. **Ranking/classification changes go through benchmark and review
   first**, never a reflexive patch — this predates the audit
   (`docs/calibration-ready-engine.md`) but the audit reconfirmed it by
   deliberately leaving `ranking/diversity-selection.mjs`'s known-failing
   test unfixed pending reproduction.

---

## C. Remaining risks (explicitly not solved by this audit)

Named so they don't quietly become assumed-fixed:

- **Incremental ingestion is designed, not built.** The current
  destructive-rebuild path is still what runs if `node db/ingest-production.js`
  is invoked — it remains frozen/not-run until the redesign lands.
- **Taxonomy has not been audited against real data.** The "Nasional/Negara
  missing" question Izzat raised directly with ChatGPT is open — the
  recommended next step (§ below) is answering it with data, not opinion.
- **Observability is still mid-collection.** Fasa 1's 7-14 day baseline
  isn't complete; `docs/observation-conclusion-v1.md` remains a template.
- **The near-duplicate ranking bug is unfixed.** It's live in production
  for `ms-MY.Politik`, quantified (`docs/exhaustive-audit-findings-v1.md`),
  but not yet reproduced/assessed for real-world impact.
- **RTM source-category overlap** (4 of 6 feeds sharing content with
  conflicting Tier-1 category claims) is scaled-up-but-not-yet-resolved
  from `docs/known-issues.md` #3.

---

## What happens next (per ChatGPT)

This audit cycle is closed. The next work is **not** more fixes from
this list — it's `db/classification-observatory.mjs`, a read-only tool
to answer the taxonomy question with real data instead of guessing from
the UI. Fasa 3 (Editorial Operations MVP) waits until that exists and
the taxonomy question is actually reviewed.
