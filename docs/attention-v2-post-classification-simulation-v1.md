# Attention V2 — Post-Classification Production Simulation v1 (2026-08-17)

Status: `[x] Read-only simulation` — script unchanged, no table written, no config/threshold touched.

Per ChatGPT's explicit checklist, run against the generation that's now
been through Migration A/B/C (verified live) and a real production
classification write (692 rows, `docs/post-classification-comparison-and-pendidikan-audit-v1.md`).

## 1. Totals

| Edition | Low confidence | Source failure | Pin expiring | Total |
|---|---|---|---|---|
| ms-MY | 43 | 0 | 0 | 43 |
| en-global | 50 | 0 | 0 | 50 |
| ar-global | 24 | 0 | 0 | 24 |
| **Keseluruhan** | **117** | **0** | **0** | **117** |

## 2. Comparison vs Baseline A — with denominator explicitly stated (per ChatGPT's instruction not to compare aggregates alone)

| | Baseline A (2026-08-16, KPM-contaminated) | New generation (2026-08-17) |
|---|---|---|
| `rss_items` (denominator) | ~933 | 745 |
| `story_clusters` (denominator) | ~881 | 691 |
| Attention total | 19 → 2 (after some resolution step not detailed in the baseline doc) | 117 |
| Source failure | not broken out in Baseline A | 0 |
| Pin expiring | not broken out in Baseline A | 0 |

**Read carefully — this is NOT an apples-to-apples aggregate
comparison, and none is claimed here**: Baseline A's "19 → 2" was
captured on a KPM-contaminated dataset before classification maturity
work this session, and the baseline document itself didn't break that
number into low_confidence/source_failure/pin_expiring sub-categories
the way this run does. The honest comparison is qualitative: both runs
show low_confidence as the dominant/only active category, `source
failure` and `pin expiring` both read 0 in this run (no active source
outages, no pins currently set — `story_overrides` has 0 rows total,
per the orphan audit already run today, so 0 pin_expiring is trivially
correct, not a gap).

## 3. Freshness gate check

Total `rss_items`: 745. Items with `published_at` older than 48h:
**328** — but critically, **every one of the 117 Attention items is
individually labeled** `"...dan berita ini masih baharu"` by the
simulation's own reasoning output, meaning the 48h freshness gate
inside `evaluateEditorialAttention()`/`fetchEditorialAttention()`
correctly excluded all 328 older items from surfacing — the 328 exist
in raw storage (expected — `rss_items` isn't pruned by age) but none
of them appeared in the Attention list. **No stale/KPM-generation item
slipped through.** `rss-kpm` presence in the new generation: confirmed
0 (re-checked directly, not assumed).

## 4. Distribution

**By edition**: ms-MY 43 (37%), en-global 50 (43%), ar-global 24 (21%)
of the 117 total.

**By Kategori/Bidang** (ms-MY, from the 43 items — full list in the
raw run output, summarized here):
Bencana (natural disaster — Flores/Colombia/Hawaii/Belgium/Greece
earthquakes and fires) is the single largest cluster within ms-MY
low_confidence, ~10 of 43. A meaningful share (~15 of 43) show
`Bidang: (tiada)` — unclassified but still surfaced, since Attention's
low_confidence gate is about classification *confidence*, not the
presence of a resolved field.

**Confidence threshold**: the simulation's own reason string
("Keyakinan klasifikasi berada di bawah ambang semakan sedia ada")
is identical across all 117 items — the existing review threshold,
unchanged, per the "jangan ubah Attention V2" instruction. This audit
did not re-derive or inspect the raw confidence float values
per-item beyond what the script already surfaces (that would require
touching the script's output shape, out of scope for a read-only run).

## 5. Source failure / pin expiring — confirmed unchanged in kind, not just count

Both read 0 across all 3 editions. `source failure` = 0 is consistent
with the ingestion run itself reporting 42/43 sources succeeded (only
`rss-kpm`, deliberately disabled, didn't fetch — not a failure).
`pin expiring` = 0 is consistent with `story_overrides` currently
having 0 rows total (confirmed via today's orphan audit) — there are
no pins to expire.

## 6. The headline finding — noise level assessment (per the simulation script's own built-in judgment)

**117 items, if Izzat opens the admin panel roughly once a week: HIGH
NOISE**, per the simulation's own stated threshold reasoning — this is
the script's existing, unmodified assessment logic, not a new
conclusion invented for this report. This is a real product signal:
the current low_confidence threshold, unchanged by this session's
work, surfaces more items than a weekly-cadence admin could reasonably
process. This was already true in principle before today (Baseline A's
own contaminated run showed a lower absolute number but was explicitly
still-KPM-distorted, not usable as a clean comparison point per §2).

**What this document does NOT conclude**: it does not decide whether
the confidence threshold should change, whether Attention V2 is
"ready," or what the fix should be — those are product/threshold
decisions for ChatGPT to weigh, explicitly out of scope for this
read-only run per its own "jangan ubah Attention V2" instruction.

## What this document does NOT do

- Does not modify `simulate-editorial-attention-production.mjs`,
  `editorialAttentionAdapter.js`, or any threshold/config
- Does not write to any table
- Does not add a Pendidikan source, reclassify anything, or touch the
  classifier
- Does not claim day-over-day/week-over-week Attention trend data
  (the script's own output already states this limitation — no
  historical AttentionItem snapshots exist to compare against)

## Next

Awaiting ChatGPT's review before any decision on whether/how Attention
V2's threshold should be revisited, and before this becomes the basis
for a "Hari Ini" feature.
