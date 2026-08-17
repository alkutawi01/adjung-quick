# Post-Classification Comparison + Pendidikan Audit v1 (2026-08-17)

Status: `[x] Read-only audit` — no classifier changed, no rule added, no manual reclassify.

Per ChatGPT's explicit request after the first production classification
run against the post-Migration-A/B/C generation.

## A. Baseline A → new generation comparison

**Note on classification-row baselines, per ChatGPT's explicit "jangan
pilih angka secara senyap" instruction**: two different prior numbers
exist and must not be conflated.
- **Baseline A** (`docs/kpm-quarantine-preflight-evidence-v1.md`,
  captured 2026-08-16, before ANY swap this session) — the real,
  coherent snapshot to compare against.
- The **267** row count read from `edition_story_classifications`
  immediately before this run was NOT a coherent baseline — it was
  stale residue from a classify-production run that predates Baseline
  A itself, progressively thinned by `repoint_story_clusters_fks()`'s
  own `DELETE ... WHERE story_id NOT IN (SELECT id FROM story_clusters)`
  cleanup on every swap since (several swaps happened this session
  without a matching re-classify run in between). It is not a valid
  comparison point and is excluded from the table below.

| Metric | Baseline A (2026-08-16, pre-swap) | New generation (2026-08-17, post A/B/C) | Change |
|---|---|---|---|
| `rss_items` total | 933 | 745 | −188 |
| `story_clusters` total | 881 | 691 | −190 |
| `rss-kpm` items present | 193 (all in Baseline A) | 0 | −193, fully quarantined |
| ms-MY classified rows | 470 (sum of categories below) | 534 | +64 |
| ms-MY unclassified | 1 | 17 | +16 |
| ms-MY / Nasional | 0 | 61 | **+61** |
| ms-MY / Politik | 0 | 34 | **+34** |
| ms-MY / Pendidikan | 193 | 0 | **−193** |
| ms-MY / Bisnes | 59 | 86 | +27 |
| ms-MY / Sukan | 59 | 102 | +43 |
| ms-MY / Agama | 42 | 44 | +2 |
| ms-MY / Hiburan | 37 | 51 | +14 |
| ms-MY / Gaya Hidup | 25 | 25 | 0 |
| ms-MY / Jenayah | 25 | 35 | +10 |
| ms-MY / Dunia | 21 | 42 | +21 |
| ms-MY / Sains | 5 | 5 | 0 |
| ms-MY / Teknologi | 2 | 30 | +28 |
| ms-MY / Bencana | 1 | 14 | +13 |
| ms-MY / Alam Sekitar | (not in Baseline A) | 3 | new |
| ms-MY / Kesihatan | (not in Baseline A) | 2 | new |
| Attention V2 (production sim) | 19 → 2 (KPM-contaminated) | not yet re-run | pending |
| `_old` tables | present (kept from Baseline A) | dropped + regenerated across this session's swaps | — |

**The single most important row**: `Pendidikan 193 → 0`, `Nasional 0 →
61`, `Politik 0 → 34` moving together is exactly the signature the
KPM-timestamp hypothesis predicted — see §B for why, confirmed with
direct evidence, not inference.

## B. Pendidikan = 0 investigation — read-only, per ChatGPT's explicit checklist

**1. Is there raw RSS supply that's clearly education-related in the new generation?**

Yes — 26 `rss_items` (language=ms) match education keywords
(pendidikan/sekolah/universiti/pelajar/guru/akademik) in their title.
Confirmed via direct query, not assumed.

**2. Which sources supply it?**

All 26 come from `rss-awani-nasional`, `rss-rtm-nasional`, `rss-astro-awani`,
`rss-metro` — **general/Nasional-category sources reporting on
education-adjacent policy news** (the "Pemansuhan AUKU" — Malaysian
higher-education-law-repeal story cluster — was the largest contributor).
**Zero** of the 26 items come from a source whose `knownCategory` is
education-specific.

**3. What is their classification evidence?**

Traced 3 representative clusters (all "Pemansuhan AUKU..." stories)
directly: each resolved to `field: "Nasional"`, `classification_status:
"classified"`, `classification_confidence: 0.98–0.99` — **Tier 1,
publisher-declared evidence** (`source_known_category: 'malaysia'` on
`rss-awani-nasional`/`rss-rtm-nasional`), the classifier's
highest-confidence tier per `docs/evidence-quality-matrix-contract.md`.

**4. Why doesn't `resolveDefaultPlacement()` produce Pendidikan?**

Because it never gets the chance to — Tier 1 (publisher_declared,
0.90–0.99 confidence, per `story-understanding.mjs`'s tier ordering
already documented in the backend audit) wins over any lower-confidence
keyword/content signal before default-placement logic is even reached.
This is the classifier working exactly as designed, not a defect —
publisher-declared category is deliberately the most-trusted evidence
tier in this project's own evidence policy.

**5. Does Pendidikan still exist in the current taxonomy?**

Yes — confirmed directly: `classification/lib/taxonomy-registry.mjs`
still defines `{ field_code: 'education', label: 'Pendidikan',
subject_codes: ['Education'], wheel_visible: true }` for ms-MY (and
equivalent English/Arabic entries). Not removed, not renamed.

**6. Does the stable-field migration have anything to do with it?**

No evidence found connecting it — `field_code: 'education'` is present
and correctly formed; nothing in this investigation touched or
implicated the Taxonomy Stable Field-ID V1 migration.

**7. Root cause, stated precisely**: **`rss-kpm` (Kementerian
Pendidikan) is confirmed, by direct read of `lab/sources.js`, to be the
ONLY source in the entire 43-source registry with `knownCategory:
'pendidikan'`.** It is disabled. No other active source declares
itself as an education-category feed. The 26 education-*keyword*
items that do exist come from general-category sources and correctly
classify as `Nasional`/other fields per their own source's declared
category — content mentioning education topics is not the same as a
source that IS an education desk.

**Conclusion — answering ChatGPT's exact question**: *"Dalam
generation baharu yang bersih daripada KPM, adakah terdapat kandungan
pendidikan yang sepatutnya menjadi Pendidikan tetapi gagal
diklasifikasikan?"* — **No.** The 26 items found are general-desk
reporting that happens to mention education topics, and they are
correctly classified per their actual publisher-declared category.
There is no misclassified Pendidikan content sitting unclassified —
there is simply no active *dedicated* education-desk source left in
the registry after `rss-kpm`'s quarantine. This is a **supply gap**
(a product/sourcing question — should a replacement education source
be added to the registry?), not a **classification bug**.

## What this document does NOT do

- Does not change the classifier, add a rule, or manually reclassify anything
- Does not conclude whether a replacement education source should be
  added — that's a product decision, out of scope for this read-only audit
- Does not run Attention V2 — separate, still-HOLD step
- Does not touch `edition_story_classifications`, `story_clusters`, or
  any other table beyond the read-only queries this audit ran

## Next

Awaiting ChatGPT's review before Attention V2 proceeds.
