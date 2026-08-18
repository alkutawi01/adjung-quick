# Control Plane Authority Boundary — Technical Assessment

Input for Izzat's decision, per ChatGPT's request. Based entirely on
`docs/control-plane-completion-audit-phase1-3-v2.md` — no new
investigation. Format: facts and risk tradeoffs only. No DB/code verdict
given — that's Izzat's call as Chief Editor, since it's a question of
editorial authority, not a technical correctness question.

---

## 1. `desk-vocabulary.mjs`

**Current role:** Maps a desk name or URL segment (e.g. `'jenayah'`,
`'/jenayah-siasatan/'`) to a Universal Subject or Geography value. ~43
subject pairs, ~12 geography pairs.

**Production consumer:** Confirmed — feeds `story-understanding.mjs`,
which feeds every published story's classification.

**What can change:** Adding/editing/removing a token→Subject/Geography
mapping.

**Likely frequency:** The file's own edit history shows mappings added
reactively — e.g. `'kes'` added 2026-08-16 after a real URL was found
using it. Tied to onboarding new sources or noticing a miscategorized
story from an unmapped token.

**Operational burden if code-driven:** Every new mapping needs a code
change + deploy. If Izzat spots a misclassified story caused by a missing
token, the fix isn't same-day unless a developer is available.

**Risk if changed incorrectly:** Narrow blast radius — only stories
matching that specific token are affected. A wrong mapping misclassifies
future stories from that source/pattern until corrected.

**Risk if exposed to Admin:** Low technical risk — it's a simple
key→value pair. The risk is editorial judgment, not system breakage;
could be paired with a valid-Subject-list check.

**Open question for Editor:** How often do you personally need to add or
fix one of these mappings? Is the current wait-for-developer cycle
tolerable, or does it block you regularly?

---

## 2. `content-rules.mjs`

**Current role:** ~40+ keyword/phrase lists across 6 subjects (Crime,
Disaster, Politics, Sports, Health, Environment) — the classifier's
last-resort evidence tier before falling back to the confidence gate.

**Production consumer:** Confirmed.

**What can change:** Adding/removing a keyword phrase for a subject.

**Who needs to change it:** Whoever notices a real story keeps coming out
unclassified or wrong because a phrase is missing — historically this has
been an editorial catch (3 separate 2026-08-13 additions for Environment,
Health, Disaster all followed this pattern).

**Risk of semantic change if migrated as-is:** High. `classification_rules`'
keyword type is an unconditional short-circuit; content-rules produces a
weighted candidate subject to the confidence gate. Treating them as
interchangeable would silently change classifier behavior from "evidence"
to "override" for every phrase moved — not a safe drop-in migration.

**Operational burden if code-driven:** Real, recurring — 3 hotfixes in one
day previously, each needing a deploy.

**Open question for Editor:** How often do you find a missed keyword in
practice? Is same-day self-service worth building a new mechanism
(distinct from `classification_rules`) to preserve the "candidate, not
override" behavior — versus asking for a small code change each time?

---

## 3. `bernama-prefix.mjs`

**Current role:** Bernama-specific prefix parsing (`"Category : Title"`)
→ Subject/Geography. 5 entries total, one source.

**Production consumer:** Confirmed, but narrow (Bernama only).

**Value to Admin operations:** Low by size and scope. No verifiable
evidence of how often this has needed changing — the file's own "stable
since 2026-08-12" comment can't be checked against git history in this
project, so it's flagged as unverified, not relied upon.

**Risk if kept in code:** Minimal — narrow blast radius (one source), and
a code change here is small enough that a developer round-trip is a low
cost even if occasionally needed.

**Open question for Editor:** Have you ever actually needed to change a
Bernama prefix mapping? If never, this is very likely a "leave in code"
case regardless of the general principle for desk-vocabulary.

---

## 4. `confidence-policy.mjs`

**Current role:** Global confidence threshold (0.6) + per-subject
overrides (Disaster/Environment/Health = 0.35) — decides whether a
detected subject is trusted enough to use, or whether the story falls
back to geography-only placement.

**Production consumer:** Confirmed.

**Which part is editorial vs. machinery:** The threshold *numbers* are
calibration judgment; the *gate logic* (compare confidence to threshold,
decide fallback) is machinery and stays in code either way.

**Risk if Admin could change the numbers freely:** High, and broad reach
— this gate applies to every story, not one source. The existing 0.35
override was a manual, not-fully-validated unblock with a disclosed
false-positive risk noted in the file itself. These numbers are tied to a
benchmark methodology (`classification/benchmark-confidence-threshold.mjs`);
changing them without re-running that benchmark risks silently degrading
classification quality broadly.

**Open question for Editor:** Do you currently need to react to and tune
these numbers yourself when you notice misclassification patterns? If so,
would a workflow requiring a benchmark re-run before a change applies be
acceptable — or does that defeat the purpose of self-service?

---

## 5. `edition-rules.mjs`

**Current role:** Per-edition condition→action rules. Currently exactly
one: for ms-MY, a foreign-politics story displays under Dunia (World)
instead of Politik.

**Production consumer:** Confirmed.

**Editorial decision actually controlled:** Not subject/geography
detection itself — this is a *display-routing* decision: "should this
detected subject, in this edition, actually show under a different
Kategori."

**Likely frequency:** Low today — only one rule exists, and the file's
own comment explicitly declines to generalize it to other subjects
without separate evidence. But this is the kind of decision that could
recur as more editions/subjects are added.

**Risk if changed incorrectly:** Moderate-to-high reach — a wrong rule
misroutes every matching story for that edition, not just one source.

**Structural note:** Closest shape-match to `classification_rules` among
all 6 items audited, but that fit is inference (reading schema comments
side-by-side), not a confirmed design decision — and `classification_rules`
has never had a real active rule in production yet (0 rows to date).

**Open question for Editor:** Do you expect to need more edition-routing
rules like this one as Quick grows, or was this a one-off fix unlikely to
recur soon?

---

## 6. `ranking/candidate-scoring.mjs` (`FRESHNESS_BUCKETS`, `BOOST_WEIGHT`)

**Current role:** Ranking formula inputs — age-to-score tiers and a
boost-flag weight. Confirmed live in production for ms-MY.Politik
(`editorial_v1` ranking).

**Production consumer:** Confirmed independently (traced import chain,
not just the file's own comment).

**Which parameter is editorial policy vs. machinery:** The *numbers*
(freshness tiers, boost weight) are product/editorial judgment about what
should rank higher; the *formula* combining them (freshness + trust +
confidence + boost) is machinery.

**Cost if made configurable:** These numbers interact — changing one in
isolation can have non-obvious effects on the final ranking order. Safe
admin editing would likely need some kind of preview/simulation, not a
bare number field, to avoid an admin unknowingly reshuffling the whole
Active Set.

**Open question for Editor:** Do you want direct control over ranking
weights day-to-day, or is this more naturally a "developer tunes based on
observed data" parameter — similar to how a search relevance algorithm
usually isn't hand-tuned by a non-engineer?

---

## Summary table

| Item | Reach if wrong | Editorial judgment needed to change | Currently in DB shape that fits? |
|---|---|---|---|
| desk-vocabulary | Narrow (per token) | Low-medium | No — none exists |
| content-rules | Narrow-medium (per phrase) | Low-medium | No — semantic mismatch with existing table |
| bernama-prefix | Narrow (Bernama only) | Low | No — and likely not worth one |
| confidence-policy | Broad (every story) | High (benchmark-bound) | No — needs process, not just storage |
| edition-rules | Medium-broad (per edition rule) | Medium | Structurally closest, unconfirmed fit |
| candidate-scoring | Broad (whole Active Set ranking) | Medium (interacting params) | No — needs preview mechanism too |

No implementation, schema, or table design proposed. Awaiting Izzat's
decision on which of these actually need Admin-operable authority before
any Fasa 4 design work begins.
