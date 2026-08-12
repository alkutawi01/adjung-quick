# Edition Mapping Matrix — English & Arabic

Status: DRAFT, built against real corpus evidence where available. Follows
`docs/universal-classification-model.md`'s locked 15-subject list.

Corpus split by source language (190-item corpus, by domain):

| Edition | Items | Sources |
|---|---|---|
| ms-MY | 50 | Kosmo, Utusan, Harian Metro, Astro Awani |
| en | 90 | BBC News World, Al Jazeera English, The Guardian World |
| ar | 50 | BBC Arabic, Al Jazeera Arabic |

**Important correction from earlier labelling:** the 190-item benchmark's draft
`field` values (Politik, Jenayah, Dunia, ...) were assigned under the
now-superseded single-taxonomy model, using ms-MY vocabulary regardless of
source language. Under the Edition model, those values approximate the
**Universal Subject**, not any one edition's display term — an English article
labelled `field: Politik` means `universal subject: Politics`, which the
English edition displays as `Politics` (near-identity) and the Arabic edition
displays as `سياسة`. This document maps Universal Subject → real edition
vocabulary; it does not re-derive subjects from scratch.

## English edition

English is close to identity-mapped from Universal Subject — expected, since
the universal list was drafted in English. Real desk/category evidence from
`classification/extract-corpus.mjs` (Al Jazeera English, Guardian):

| Universal Subject | English display | Evidence |
|---|---|---|
| Politics | Politics | AJ-EN desk, Guardian `us-politics`/`world` |
| Crime | Crime | content rules (no dedicated desk found) |
| Economy | Economy | AJ-EN desk `economy` |
| Business | Business | Guardian desk `business` |
| Sports | Sports | AJ-EN desk `sports`, Guardian `football` |
| Health | Health | Guardian `global health` |
| Education | Education | content rules |
| Science | Science | Guardian `science` |
| Technology | Technology | content rules |
| Environment | Environment / Climate | Guardian desk `environment` |
| Disaster | Disaster | content rules (locked 2026-08-12) |
| Culture | Culture | Guardian category `culture` |
| Entertainment | Entertainment | content rules |
| Religion | Religion | not observed in corpus — proposed, standard English news term |
| Lifestyle | Lifestyle | Guardian `travel`/`food` sections suggest this exists but under different desk names |

English needs no Business/Economy merge — the corpus already shows Guardian
running both as separate desks, confirming ChatGPT's boundary rule
transfers cleanly.

## Arabic edition

Real desk/category evidence from Al Jazeera Arabic (`aljazeera.net`) and BBC
Arabic — Al Jazeera Arabic's own RSS categories map almost 1:1 onto the
Universal Subject list, which is strong independent confirmation the 15-subject
list is well-chosen, not ms-MY-biased:

| Universal Subject | Arabic display | Evidence |
|---|---|---|
| Politics | سياسة | AJ-Arabic desk `politics`/category `سياسة` (5 items) |
| Crime | جريمة | not observed in corpus — proposed, standard MSA term |
| Economy | اقتصاد | AJ-Arabic desk `ebusiness`/category `اقتصاد` (2 items) |
| Business | أعمال | proposed — AJ-Arabic's `ebusiness` desk covers both macro and corporate stories in this corpus slice; needs a larger sample to confirm Arabic media actually splits these the way English/Malay do |
| Sports | رياضة | AJ-Arabic desk `sport`/category `رياضة` (3 items) |
| Health | صحة | AJ-Arabic desk `health` (dental/PCOS stories) |
| Education | تعليم | not observed — proposed, standard MSA term |
| Science | علوم | AJ-Arabic desk `science`/category `علوم` (1 item) |
| Technology | تكنولوجيا | AJ-Arabic desk `tech` (1 item) |
| Environment | بيئة | not observed — proposed, standard MSA term |
| Disaster | كوارث | not observed — proposed, standard MSA term |
| Culture | ثقافة | AJ-Arabic desk `arts`/category `فن` — see note below |
| Entertainment | فنون وترفيه | AJ-Arabic desk `arts` covers both culture and celebrity content in this corpus (e.g. actor casting controversy) — Arabic may not cleanly separate Culture/Entertainment the way ms-MY does with Budaya/Hiburan. **Flagged for ChatGPT: possible edition-specific merge, not a universal-layer problem.** |
| Religion | دين | not observed — proposed, standard MSA term |
| Lifestyle | منوعات | not observed — proposed, standard MSA term |

**Open flag:** AJ-Arabic's `arts` desk (`فن`) contained both a heritage/language
feature (Culture) and a celebrity casting story (Entertainment) in this
corpus — the same ambiguity Izzat resolved for ms-MY (splitting Budaya from
Hiburan) may or may not hold for Arabic. Needs either a larger Arabic sample
or an explicit editorial call, not a guess.

## Coverage summary

| | Corpus-confirmed | Proposed (standard terminology, unconfirmed) |
|---|---|---|
| English | 10/15 | 5/15 (Crime, Education, Technology, Religion, Lifestyle partially) |
| Arabic | 6/15 | 9/15 |

Arabic has the thinnest evidence (50 items, several subjects never appeared).
The "proposed" cells use standard Modern Standard Arabic news vocabulary — low
risk of being wrong, but genuinely untested against Adjung's actual Arabic
sources. Per ChatGPT's own benchmark discipline (`classification/benchmark.mjs`),
these should be flagged as low-confidence until a larger Arabic corpus sample
confirms or corrects them — do not silently treat "proposed" cells as equal
confidence to corpus-confirmed ones.

## Next steps

1. Confirm this matrix with ChatGPT — especially the Arabic Culture/
   Entertainment merge question.
2. Re-audit `docs/quick-bidang-taxonomy.md`'s ms-MY 15 against the now-locked
   Universal Subject list — expect `Malaysia`/`Dunia` to formally move to the
   Geography dimension (already anticipated in `universal-classification-model.md`).
3. Resume Round 2 (49 paused boundary cases) — re-examine which are still
   real subject disputes vs. artifacts of the old flat-taxonomy forcing
   (e.g. several EN/AR "Politik vs Dunia" disputes were symptoms of exactly
   this problem and may resolve automatically once geography and subject are
   separate dimensions).
