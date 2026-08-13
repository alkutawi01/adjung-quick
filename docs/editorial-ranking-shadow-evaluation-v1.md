# Editorial Ranking Shadow Evaluation v1 (2026-08-13)

Status: **Evaluation record, no code.** Per ChatGPT: interprets
`ranking/shadow-mode-run.mjs`'s output — raw numbers alone (stability %)
don't say whether a difference is good, bad, or neutral. That judgment
needs findings written down and, for the sharpest cases, a manual
editorial review (§5 — still pending Izzat's input, not completed here).

## 1. Objective

Answer: for each of 5 real fields, when the Editorial Ranking Engine
(Candidate Scoring → Diversity Selection → Editorial Composition)
disagrees with the legacy selector (top-N by ingestion-time
`editorial_score`), is that disagreement an improvement, a neutral
difference, or something to investigate further — never assume more
change automatically means better.

## 2. Scope

5 real `ms-MY` fields, run live via `ranking/shadow-mode-run.mjs`,
deliberately chosen for different CHARACTER (not exhaustive coverage,
per ChatGPT): Politik (many sources), Agama (moderate), Pendidikan
(single-source, large volume), Sains (single-source, tiny), Teknologi
(single specialised newsroom).

## 3. Results table

| Field | Candidates | Stability | Main difference |
|---|---|---|---|
| Politik | 36 | 70% | diversity adjustment (source spread) |
| Agama | 24 | 40% | source distribution (ikim/utusan-agama/jaipp vs. utusan-agama alone) |
| Pendidikan | 193 | 50% | freshness recalculation (same single source, different stories within it) |
| Sains | 5 | 100% | no change needed |
| Teknologi | 31 | 30% | freshness recovery (7 fresher Amanz stories legacy's frozen score missed) |

## 4. Findings

### Editorial improvement candidates

- **Teknologi's freshness recovery**: legacy's `editorial_score` is set
  ONCE at `db/ingest-production.js` time and never revisited — a story
  ingested early keeps its score even as newer, fresher Amanz stories
  arrive. The editorial pipeline recomputes freshness live, so it
  correctly surfaces 7 stories legacy's frozen score effectively buried.
  This looks like a genuine legacy limitation, not just "a different
  opinion" — worth flagging as the strongest concrete case for
  `editorial_v1` in this evaluation.
- **Agama's source spread**: legacy selected 10/10 from
  `rss-utusan-agama` alone despite `rss-ikim` and `rss-jaipp` both having
  real, on-topic candidates. Whether this is an improvement depends on
  whether Utusan Agama's 10 stories were genuinely the 10 best, or
  whether they simply arrived earlier/scored marginally higher at
  ingestion time — this is exactly the kind of judgment call §5's manual
  review exists to answer, not something the stability number alone can
  settle.

### Neutral differences

- **Sains — 100% stability**: both paths agree completely when there's
  no room to differ (5 candidates, 1 source). Confirms the engine isn't
  forcing change where none is warranted — the same finding
  `docs/ranking-engine-small-field-production-benchmark.md` already
  established from the composition-swap side; this is the same result
  from the shadow-comparison side.
- **Politik's diversity adjustment**: a defensible, expected difference
  — this is the mechanism working as designed (`docs/ranking-engine-selection-policy-v1.md`),
  not necessarily evidence that legacy was WRONG, just that it doesn't
  have a diversity concept at all.

### Unknowns

- **Is fresher always better?** Not necessarily — an important but
  slightly older story can matter more than a minor, fresher one
  (exactly `docs/ranking-engine-benchmark-v1.md` Group A's original
  trade-off case). The shadow results show WHAT changed; they don't by
  themselves prove the change is an improvement. This is precisely why
  §5's manual review is required before any activation decision, not
  optional polish.
- **Agama's specific 6 added stories** — are they genuinely better, or
  just differently defensible? Needs a human editorial judgment call,
  not a metric.
- **Whether 30-70% stability is itself a meaningful signal** — no
  baseline exists yet for "how much change is expected/healthy" versus
  "how much change should raise concern." This evaluation doesn't
  attempt to set that threshold.

## 5. Manual review sample — COMPLETE (Izzat's editorial judgment, 2026-08-13)

**Promoted by editorial (in editorial's Active Set, not in legacy's):**

| # | Field | Title | Source | Izzat's verdict | Why |
|---|---|---|---|---|---|
| 1 | Teknologi | Manus Kembali Beroperasi Sebagai Syarikat Bebas... | rss-amanz | ✅ Better | Real industry value — a company/ecosystem change, not just a new product. Fits Adjung. |
| 2 | Teknologi | SpaceXAI Memperkenalkan Grok Bot... | rss-amanz | ⚖️ Equivalent / slightly better | Conditional on actual content — genuine AI-agent news has value, but AI news easily turns into hype; needs care. |
| 3 | Agama | Be the Villager: How Small Acts Can Restore Fading Compassion | rss-ikim | ✅ Better | A good example — thoughtful/values content, not sensationalism. Matches Adjung's identity of meaningful curation. |
| 4 | Agama | BENGKEL TAHSIN QIRAATUL QURAN NEGERI PULAU PINANG... | rss-jaipp | ✅ Better | Local, but represents real religious/educational activity — more appropriate than chasing personalities or controversy. |
| 5 | Pendidikan | Akses Pendidikan Untuk Semua | rss-kpm | ⚖️ Equivalent | Title too generic — could be valuable if the content has real new policy, but the title alone reads weak. |

**Demoted by editorial (in legacy's Active Set, not in editorial's):**

| # | Field | Title | Source | Izzat's verdict | Why |
|---|---|---|---|---|---|
| 1 | Teknologi | HONOR Robot Phone Dilancarkan... | rss-amanz | ✅ Correctly demoted | Reads as a product announcement — not wrong, but low long-term value. Adjung shouldn't become a gadget portal. |
| 2 | Agama | Ujian buat Imam al-Bukhari di tanah kelahirannya | rss-utusan-agama | ❌ **INCORRECTLY demoted** | Reads as historical/religious knowledge content with real value. The engine may be too aggressive dropping stories with no "trend" signal. |
| 3 | Agama | Bicara al-Quran tentang makhluk perosak | rss-utusan-agama | ⚖️ Equivalent | Depends on the actual content — fairly niche title. Not necessarily needed in a limited slot, but not weak content either. |
| 4 | Politik | Wong Chen umum keluar PKR, sertai Bersama | rss-awani-politik | ✅ Correctly demoted | Individual-politician news typically goes stale fast. For Adjung, should only rank up if there's a real national/policy implication. |
| 5 | Pendidikan | Hari Pertama Persekolahan Sesi 2024/2025 | rss-kpm | ✅ Correctly demoted | (No further reason given — consistent with the pattern above: routine/recurring institutional content, low distinct value.) |

### Net result: 8/10 correct or acceptable, 1 real miss, 1 conditional

**The one clear regression**: "Ujian buat Imam al-Bukhari di tanah
kelahirannya" — Izzat's only unambiguous "incorrectly demoted" verdict.
His stated reason points at a real gap in the current model: **the
engine has no way to recognize depth/knowledge-value content that lacks
a "trend" signal** (no freshness spike, no source-diversity trigger,
nothing Candidate Scoring or Composition currently measures). This
content was demoted purely because something else scored/discounted
higher — not because anything was wrong with it.

**A broader editorial principle surfaced, beyond this specific sample**:
Izzat's reasoning across multiple verdicts converges on a consistent
philosophy — favor lasting/thoughtful content, be wary of pure product-
announcement churn ("Adjung shouldn't become a gadget portal") and
individual-politician news that goes stale fast (should only surface with
real national/policy implication). This reads as a real signal for
**Editorial Composition classes A-D** (headline/update/context/niche —
still undefined, `docs/editorial-composition-policy-v1.md`) once those
get an operational definition: depth/evergreen value looks like a
genuine candidate dimension, distinct from freshness or source trust.

## Next

Per ChatGPT: no flag activation until this evaluation AND the manual
review sample (§5) are both complete. §5 specifically needs Izzat's
actual editorial judgment — not something to fill in without him.
