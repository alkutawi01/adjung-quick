# Edition Taxonomy v0.1 (baseline, not final)

> **OBSOLETE 2026-08-12 — superseded by `docs/edition-architecture-model.md`**
> (Edition is now a first-class entity with its own classification, not a
> simple resolver). The master table below is still useful **raw material**
> for Sesi 2 (Edition Taxonomy Design) — don't discard the data, just don't
> treat this document's framing as current.

Status: DRAFT baseline per ChatGPT's ordering — built before Round 2 resumes,
so that when a story is classified `Universal Subject: Business`, we already
know what every edition displays for it. Consolidates
`docs/quick-bidang-taxonomy.md` (ms-MY), `docs/edition-mapping-matrix-en-ar.md`
(en/ar), and ChatGPT's Culture/Entertainment ruling for Arabic.

## The master table

`confidence` follows ChatGPT's new `edition_mapping_confidence` concept —
separate from classification confidence, tracks how sure we are the *display
term itself* is right for that edition.

| Universal Subject | ms-MY | conf. | English | conf. | Arabic | conf. |
|---|---|---|---|---|---|---|
| Politics | Politik | high | Politics | high | سياسة | high |
| Crime | Jenayah | high | Crime | high | جريمة | low (proposed) |
| Economy | Ekonomi | high | Economy | high | اقتصاد | high |
| Business | Bisnes | high | Business | high | أعمال | medium |
| Sports | Sukan | high | Sports | high | رياضة | high |
| Health | Kesihatan | high | Health | high | صحة | medium |
| Education | Pendidikan | high | Education | high | تعليم | low (proposed) |
| Science | Sains | high | Science | high | علوم | high |
| Technology | Teknologi | high | Technology | high | تكنولوجيا | high |
| Environment | Alam Sekitar | high | Environment/Climate | high | بيئة | low (proposed) |
| Disaster | Bencana | high | Disaster | high | كوارث | low (proposed) |
| Culture | Budaya | high | Culture | high | **ثقافة وفنون** (merged with Entertainment, edition-level decision) | medium |
| Entertainment | Hiburan | high | Entertainment | high | **ثقافة وفنون** (see above) | medium |
| Religion | Agama | low (future candidate, not v1) | (TBD — may not exist as a section, or "Society") | low | دين | low (proposed) |
| Lifestyle | **open — see below** | — | Lifestyle | medium | منوعات | low (proposed) |

## Arabic Culture/Entertainment — LOCKED as an edition-level merge

Per ChatGPT: don't force Arabic to split what its own real sources (Al
Jazeera Arabic's single `فن`/arts desk) don't split in practice. Universal
layer keeps `Culture` and `Entertainment` genuinely separate — the merge is a
**display-only** decision for the Arabic edition, revisit once a larger
Arabic corpus sample shows real separation in practice. This is the concrete
proof of the principle: *"Universal taxonomy answers 'what kind of thing is
this?'; Edition taxonomy answers 'how does an ordinary reader in that culture
find it?'"*

## Still open: does ms-MY need `Lifestyle`, and what happens to Malaysia/Dunia?

Raised in `docs/ms-my-edition-reaudit.md`, not yet answered. Under the old
model, `Malaysia`/`Dunia` silently absorbed human-interest, no-clear-subject
stories (e.g. a mother's surprise SOCSO pension eligibility). Now that they're
confirmed to be Geography values, not Bidang, those stories need a landing
spot in the ms-MY edition or `Unclassified` rate rises. Two live options,
genuinely undecided:

1. Add `Lifestyle` to the ms-MY edition (universal subject already exists,
   just never drafted for ms-MY — Malaysian portals do run lifestyle/human-
   interest sections).
2. Accept a higher `Unclassified` rate for ms-MY specifically as the honest
   cost of removing false-subject Bidang — consistent with the "precision
   over coverage" lock, but a real UX question about how the Wheel treats a
   language edition with more Unclassified stories.

## Confidence legend

- **high** — corpus-confirmed (real desk/category/RSS evidence, or explicit
  Izzat ruling).
- **medium** — plausible from partial/adjacent evidence, or a deliberate
  edition-level simplification (like the Arabic merge above).
- **low (proposed)** — standard terminology, not confirmed against Adjung's
  actual sources. Per ChatGPT: don't over-invest verifying these now (*"kita
  bukan sedang bina kamus bahasa Arab"*) — confirm against real production
  corpus once ingestion is live (Sesi 3), not now.

## Next

1. Get Izzat's call on Lifestyle/Malaysia/Dunia above.
2. Lock this as v1 (drop the "0.1"), formalize alongside
   `universal-classification-model.md`'s Subject/Geography/Attribute lists.
3. Resume Round 2 (49 paused boundary cases) — re-examine against this table;
   several should resolve automatically now that geography and subject are
   separated.
