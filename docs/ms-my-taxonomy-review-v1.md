# ms-MY Taxonomy Reality Review v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` → **DECIDED 2026-08-13** `[x] Implementation pending` `[x] Closed`

## RESOLVED — Izzat's final decision (2026-08-13)

> "tukar ke Nasional, saya setuju. dan jadikan Nasional dan Dunia mcm
> bidang2 lain."

This **overrides** the "separate navigation mode" design this session
converged on (`docs/geography-residual-navigation-policy-v1.md` →
`docs/geography-navigation-contract-v1.md` →
`docs/geography-navigation-implementation-plan-v1.md`, all superseded —
kept for the reasoning trail, not for implementation). Izzat's own
question — *"macam mana portal berita biasa buat utk isu-isu macam
ni?"* — corrected the over-engineering: real Malay portals (Astro
Awani, Utusan, BH) just list Nasional/Dunia as ordinary menu items next
to Politik/Sukan — no special mode.

**Implemented and verified live** (`https://adjung-quick.vercel.app`):
- `classification/lib/edition-taxonomy.mjs`: local residual label
  `'Malaysia'` → `'Nasional'`
- `state/editions.js`: `ms-MY.taxonomy` now includes `Nasional` (first —
  the cold-start default, per `App.jsx`'s `taxonomy[0]`) and `Dunia` as
  ordinary Bidang, 16 total
- `classify-production.js --write` re-applied: `Nasional: 63` (exact
  same stories, pure relabel), `Dunia: 46` (unchanged, was already
  reachable)
- Confirmed live: Wheel shows all 16 items, Nasional loads as the
  cold-start default with real content (10/10 slots filled), Dunia
  unaffected

Category: **Review document** — the original data findings below remain
valid and are what informed Izzat's decision; only the navigation-shape
recommendation at the bottom was superseded by his simpler call.

Data source: `db/classification-observatory.mjs` (all 896 active
clusters, 2026-08-13) plus a direct 20-story sample pull per bucket
(same pipeline, read-only).

---

## Current ms-MY field distribution (real, not estimated)

| Bidang | Count | % of classified |
|---|---:|---:|
| Pendidikan | 193 | 24% |
| Sukan | 94 | 12% |
| Bisnes | 92 | 11% |
| **Malaysia** | 63 | 8% |
| Hiburan | 61 | 7% |
| Dunia | 46 | 6% |
| Agama | 44 | 5% |
| Jenayah | 32 | 4% |
| Politik | 32 | 4% |
| Teknologi | 29 | 4% |
| Gaya Hidup | 25 | 3% |
| Bencana | 13 | 2% |
| Sains | 5 | 1% |
| Alam Sekitar | 5 | 1% |
| Kesihatan | 3 | <1% |

814/896 classified (91%), 82 unclassified (9%).

---

## Question 1: Is "Nasional" actually missing, or renamed?

**Answer: functionally present, under the name `Malaysia`.**

Every sampled `Malaysia`-field story (20/20) resolves via
`classification_rule: story_understanding.geography:Malaysia -> ms-MY.Malaysia`
— the geography-fallback path. This fires precisely when a story has
**no specific subject match** but **is about Malaysia**. In practice
that's exactly what a general "Nasional" bucket is for. Real sampled
titles:

- "Malaysia, Rusia perkukuh kerjasama strategik penyelidikan dan
  perdagangan"
- "NXP perluas kemudahan A&T di Petaling Jaya, perkasa ekosistem
  semikonduktor"
- "Pemerkasaan STEM dan TVET penting lahir bakat pacu inovasi"
- "MBJB bakal wujud pusat kurungan tangani isu anjing, kucing liar"
- "Nilai pelaburan Selangor Aero Park dijangka cecah RM1 bilion"

This is a real spread of general-interest Malaysian news — foreign
relations, tech investment, education initiatives, local government,
infrastructure — not a narrow political bucket. **It reads exactly like
what a reader would expect from a "Nasional" section.**

Notably, two of the 20 sampled `Malaysia` items even show the confidence
gate actively rejecting a weak `Politics` signal before landing here:

```
confidence_gate:Politics@0.4<0.6 -> story_understanding.geography:Malaysia -> ms-MY.Malaysia
```

i.e. a story that only weakly hinted at Politics correctly fell through
to the general Malaysia bucket instead — the system is already making
the distinction Izzat was worried it wasn't making.

## Question 2: Is `Politik` swallowing all national news, leaving nothing else?

**Answer: no — the two fields have cleanly separated in practice,
without anyone designing it explicitly.**

All 20 sampled `Politik` stories are genuinely **party politics**:
elections (PRN Melaka, PRN Sarawak, PRU16), party leadership (DAP, PKR,
UPKO, GPS, BN), parliamentary seat changes. Real sampled titles:

- "PRN Melaka: Hala tuju kerjasama, pembahagian kerusi dibincang MKT 28
  Ogos ini"
- "Wong Chen letak jawatan Ahli Parlimen Subang berkuat kuasa hari ini"
- "Kongres Nasional PKR fokus agenda reformasi, ekonomi dan pengukuhan
  parti - Amirudin"
- "GPS sedia hadapi PRN Sarawak, jumlah kerusi bukan isu - Abang
  Johari"

None of the 20 are general-interest national news. So the practical
split that's emerged is:

```
Politik  = party politics, elections, parliamentary maneuvering
Malaysia = general national news that isn't about a specific party/election
```

This matches ChatGPT's hypothesis exactly: *"Politik = parti, pilihan
raya, dasar politik; Malaysia = berita nasional umum."*

## Question 3: Is Kesihatan genuinely empty (taxonomy gap) or a
calibration issue?

**Answer: confirmed calibration/source issue, not a missing-field
problem** — consistent with this session's earlier finding
(`docs/post-launch-classification-calibration-v1.md`). Kesihatan now
shows **3** real stories (was 0 before this session's calibration work),
via the `SUBJECT_CONFIDENCE_OVERRIDES` fix. Small, but non-zero and
real — the Bidang itself is not the problem; source/content coverage is
thin. This is exactly what was already tracked, not a new finding.

## Question 4: What's in the unclassified 9% (82 stories)?

Sampled 20 real unclassified titles. Two distinct, unrelated causes:

1. **Foreign-language content correctly excluded** — a large share of
   the raw unclassified pool (not all 20 in this specific ms-MY sample,
   but visible in the wider funnel) is Arabic-language BBC/Al Jazeera
   content with no Malaysia geography relevance. `ms-MY` correctly
   doesn't force these into a Bidang — that's working as intended, not
   a gap.
2. **Genuine local content with no evidence match** — real Malay
   human-interest/crime-blotter items with no Tier 1-5 signal at all:
   - "Terima upah RM600 bagi setiap misi haram"
   - "Lelaki terjun sungai elak polis ditemukan lemas"
   - "'Nasib baik tak jadi jenazah' - Hakim tegur bekas siak, wanita
     cuba berzina di bilik jenazah"
   - "Kawal populasi anjing terbiar: MBS bayar RM50 seekor anjing
     terbiar diserah sukarela"

   These read like they'd fit **Jenayah** (crime) or **Malaysia**
   (general local) if the classifier had evidence for them — a
   vocabulary/coverage gap, not a taxonomy design gap. Same class of
   issue as the earlier Bencana/Kesihatan calibration work, not
   something this review recommends acting on now (frozen per the audit
   closure — classification changes go through the existing calibration
   process, not this document).

---

## Would a Malay news-portal reader feel a gap?

**Recommendation: likely no, once they understand `Malaysia` as the
general-news home** — but the field's *name* is worth a genuine product
conversation, separate from this data review:

- The taxonomy already covers what a reader expects structurally:
  general national news (Malaysia), party politics (Politik), crime
  (Jenayah), business (Bisnes), education (Pendidikan), and more — this
  is not a thin taxonomy.
- The one real risk: a reader who specifically expects a Bidang **named**
  "Nasional" (a very common label on Malay news portals — Astro Awani,
  Utusan, BH all use it) might not intuitively look under "Malaysia"
  for that content, even though the content itself is right.
- This is a **naming/labeling question, not a missing-category
  question** — and naming is explicitly Izzat's call, not a data
  conclusion this document can make.

## What field is too small?

Kesihatan (3), Alam Sekitar (5), Sains (5) — already known, already
tracked (`docs/observation-conclusion-v1.md`, `docs/field-visibility-evaluation-v1.md`).
Nothing new here; this review doesn't add a new small-field finding.

---

## Recommendation (not a decision — Izzat's to make)

1. **Do not add a new "Nasional" field.** The data shows its function
   already exists (`Malaysia`), and merging or splitting further risks
   creating the exact cross-field ambiguity this review found the
   system currently avoids.
2. **Consider whether `Malaysia` should be *labeled* "Nasional" instead**
   — a naming decision, zero classifier/taxonomy risk, purely a display
   string change. Not implemented here — flagged as the one concrete,
   low-risk option this data supports, for Izzat to decide.
3. **No other taxonomy structure change is supported by this data.**

## What this document does NOT do

- Does not rename, add, or remove any field
- Does not change `classification/lib/edition-taxonomy.mjs` or any
  classifier code
- Does not re-open the Bencana/Kesihatan calibration already closed
  this session
- Does not decide the naming question in §Recommendation — that's
  Izzat's call to make, informed by this data
