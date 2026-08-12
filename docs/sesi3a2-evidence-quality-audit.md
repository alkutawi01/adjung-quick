# Sesi 3A.2 — Evidence Quality Audit

Status: audit only, per ChatGPT — **no engine, taxonomy, or rule changes in
this pass.** Run: `node classification/audit-evidence-quality.mjs`, against
274 live items.

## 1. Evidence mix behind the top candidate

Of the 170/274 (62%) items that got at least one subject candidate:

| Evidence mix | Share |
|---|---|
| Multiple evidence types agreeing | 55% |
| `title_keyword` only | 37% |
| `rss_category` only | 4% |
| `url_segment` only | 4% |
| **No candidate at all** | **38% of all 274** |

Read together with `sesi3a-first-run-results.md`'s 61% raw coverage number:
this confirms the "quality of evidence" story matters more than the raw
percentage. 55% of covered items now have *multiple independent tiers
agreeing* — that's the strong, trustworthy half. The concerning slice is the
37% resting on `title_keyword` alone, no structural confirmation at all.

## 2. Candidate Conflict Report — 9/274 (3%)

Two different kinds of conflict showed up, and they should be treated very
differently:

**Genuine editorial ambiguity (good signal, keep):**
- *"British man with dementia told to leave Sweden..."* — `Politics` (0.7,
  `rss_category`) vs `Health` (0.7, `rss_category`). The Guardian's own feed
  tagged this with both categories — a real story that's genuinely both.
- *"UK heatwave live: Met Office issues extreme heat warning as
  government..."* — `Environment` (0.75, `url_segment`) vs `Politics` (0.7,
  `rss_category`). Also real: an environmental event with a genuine
  government-response angle.

**Content-rule false positives (bad signal, needs fixing):** several
conflicts trace back to two overly generic phrase matches in
`content-rules.mjs` — `menteri` (minister) and `mahkamah`/`court` — which
fire on *any* passing mention, not a story actually about politics or a
legal case:
- *"Sultan Brunei hubungi Anwar, doakan kesihatan"* (Sultan of Brunei calls
  Anwar to wish him a health recovery) → tagged `Politics` (0.4) purely
  because Anwar's title implies "menteri". This is a courtesy/human-interest
  story, not one *about* politics as a subject.
- *"Selepas pulihkan kerugian RM13 bilion Tabung Haji, PM disaran tumpu
  Felda, MARA"* → tagged `Crime` (0.4, "didakwa") despite being a policy
  recommendation story with no crime angle.
- *"Former judge Baka elected new Hungarian president..."* → tagged `Crime`
  (0.4, "court") purely from the word "judge" in "Former judge", despite the
  story being about an election result.

**This is the concrete, measured "false confidence" example ChatGPT asked
for** — though at low (0.4) confidence rather than high, which is itself a
useful finding: the current confidence weighting already keeps these weak
matches from *dominating*, but they still pollute the candidate list and
trigger false conflict flags. Recommended fix (not applied in this pass, per
"don't add rules yet"): make `menteri`/`mahkamah`/`court` require a more
specific phrase (e.g. "menteri mengumumkan", "dibicarakan di mahkamah")
rather than matching as a bare word — narrowing existing rules, not adding
new ones.

## 3. Manual review sample (30 items, spread across quality buckets)

Full output in the audit script's run log. Pattern confirmed by eyeballing:

- **Tier 1-backed items (feed_category present) are clean and correct** —
  every Harian Metro Bisnes/Arena item in the sample (10 Business, 10
  Sports) is a genuinely on-topic story at 0.98–0.99 confidence. This is
  strong evidence Tier 1 is trustworthy where it's wired in.
- **`title_keyword`-only items are exactly where the risk concentrates** —
  matches the three false-positive examples above. Low confidence (0.4) is
  appropriately conservative, but the *evidence itself* is weak, not just
  the score.

## Recommendation before Sesi 3B

The evidence layer is healthy enough to hand to Edition Classification **for
the Tier 1/2/3-backed 55%+multi-type share** — those candidates are reliable.
The `title_keyword`-only 37% should be treated by Edition Classification as
explicitly lower-trust (already reflected in the 0.4 confidence, so 3B's
per-edition resolution logic should account for this rather than treating
all "has a candidate" stories equally).

**Not recommending a rule-narrowing pass right now** — per ChatGPT's "don't
add keywords yet" instruction, and because this is 3 conflict cases out of
274 items, not yet a volume that justifies rule surgery. Flagged as a known,
understood, low-priority gap for whenever content rules are revisited with
real measured need, not now.
