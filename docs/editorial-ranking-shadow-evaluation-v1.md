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

## 5. Manual review sample — PENDING, needs Izzat's input

Per ChatGPT: shadow metrics alone are not sufficient — stability 30%
could be very good or very bad depending on what specifically changed.
The following 10 stories (5 promoted by editorial, 5 demoted) are
prepared for review; **the Better/Worse/Equivalent judgment and reason
columns are intentionally left blank** — this requires an actual human
editorial call, not something to be filled in without Izzat's input.

**Promoted by editorial (in editorial's Active Set, not in legacy's):**

| # | Field | Title | Source | Reason (from engine) | Izzat: Better/Worse/Equivalent | Why |
|---|---|---|---|---|---|---|
| 1 | Teknologi | Manus Kembali Beroperasi Sebagai Syarikat Bebas... | rss-amanz | fresh, trusted_source, source_diversity_discounted | | |
| 2 | Teknologi | SpaceXAI Memperkenalkan Grok Bot – AI Berejen... | rss-amanz | fresh, trusted_source, source_diversity_discounted | | |
| 3 | Agama | Be the Villager: How Small Acts Can Restore Fading Compassion | rss-ikim | trusted_source, source_diversity_preserved | | |
| 4 | Agama | BENGKEL TAHSIN QIRAATUL QURAN NEGERI PULAU PINANG... | rss-jaipp | source_diversity_preserved | | |
| 5 | Pendidikan | Akses Pendidikan Untuk Semua | rss-kpm | fresh, trusted_source, source_diversity_discounted | | |

**Demoted by editorial (in legacy's Active Set, not in editorial's):**

| # | Field | Title | Source | Izzat: Better/Worse/Equivalent | Why |
|---|---|---|---|---|---|
| 1 | Teknologi | HONOR Robot Phone Dilancarkan – Telefon Dengan Kamera... | rss-amanz | | |
| 2 | Agama | Ujian buat Imam al-Bukhari di tanah kelahirannya | rss-utusan-agama | | |
| 3 | Agama | Bicara al-Quran tentang makhluk perosak | rss-utusan-agama | | |
| 4 | Politik | [TERKINI] Wong Chen umum keluar PKR, sertai Bersama | rss-awani-politik | | |
| 5 | Pendidikan | Hari Pertama Persekolahan Sesi 2024/2025 | rss-kpm | | |

## Next

Per ChatGPT: no flag activation until this evaluation AND the manual
review sample (§5) are both complete. §5 specifically needs Izzat's
actual editorial judgment — not something to fill in without him.
