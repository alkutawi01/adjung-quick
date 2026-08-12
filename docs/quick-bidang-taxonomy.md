# Quick Bidang Taxonomy (v1)

Decided 2026-08-12. Izzat chose **Option B** from
`docs/classification-taxonomy-mapping.md` — a dedicated Quick news taxonomy
rather than Adjung Brief's 24 essay Bidang (which lack `Politik` and `Jenayah`,
the two largest real categories in the corpus, while carrying
`Matematik`/`Falsafah`/`Sastera` that would never fire on a news wire).

ChatGPT audited the 12-Bidang draft and made two changes: split `Hiburan` out of
`Budaya`, and separate `Unclassified` from Bidang at the data-model level.
Confidence 0.98 / 0.94.

Quick is a daily news reader; Brief is an essay platform. A Quick→Brief mapping
can be written later if the two ever share content.

## The list — 13 Bidang

**Subject Bidang** (a story's topic):

| Bidang | Covers | Desk evidence in corpus |
|---|---|---|
| **Politik** | party politics, parliament, elections, government | `nasional/politik`, `berita-politik`, `politics`, `سياسة` |
| **Jenayah** | crime, courts, police, fraud, enforcement | none — content rules only, yet plausibly the largest real category |
| **Ekonomi** | economy, business, markets, ringgit, companies | `ekonomi`, `economy`, `business`, `ebusiness`, `اقتصاد` |
| **Sukan** | sport | `sport`, `sports`, `football`, `رياضة` |
| **Alam Sekitar** | environment, haze, floods, wildlife, climate | `environment` |
| **Kesihatan** | public health, hospitals, disease, outbreaks | content rules |
| **Pendidikan** | schools, universities, students | content rules |
| **Teknologi** | technology, telco, digital | `tech`, `تكنولوجيا` |
| **Sains** | science, research, space | `science`, `علوم` |
| **Budaya** | arts, heritage, language, custom, literature, museums | `arts`, `فن` |
| **Hiburan** | artists, celebrities, film, drama, music, TV, concerts | `gaya/hiburan` |

**Residual Bidang** — assigned only when no subject rule fires:

| Bidang | Covers |
|---|---|
| **Malaysia** | Malaysian general/national news with no clear subject |
| **Dunia** | international news with no clear subject |

Names reuse Adjung Brief's spelling where the concept matches (`Alam Sekitar`,
`Pendidikan`, `Sains`, `Teknologi`, `Budaya`, `Ekonomi`, `Sukan`) so a future
Quick↔Brief mapping is mostly identity.

### Why Budaya and Hiburan are separate (ChatGPT's correction)

`Budaya` in Adjung's sense is arts/heritage/language/custom/literature. Celebrity
and showbiz news — real in this corpus ("Sejuk hati lihat penampilan baharu
Zahirah MacWilson") — is not that. Lumping them reads wrong editorially and
makes `Budaya` a catch-all.

## LOCKED — Subject beats geography

`Politik` (subject) and `Malaysia` (geography) are different *kinds* of
category. A Malaysian MP defecting is both, and the engine assigns exactly one
topic per story (locked: "an item is never split across two topics"). The rule:

```
subject signal?     ── yes ──> subject Bidang
        │ no
        ▼
geographic signal?  ── yes ──> Malaysia | Dunia
        │ no
        ▼
                               Unclassified  (status, not a Bidang)
```

- Politik + Malaysia → **Politik**
- Jenayah + Malaysia → **Jenayah**
- Malaysian news, no clear subject → **Malaysia**
- International news, no clear subject → **Dunia**

This turns the 32% geographic-only signal from useless into a productive floor,
without letting geography compete with subject.

**Both candidates are retained internally** even though only one wins, so the
audit trail can say *"this is Politik by subject rule, even though it is also a
Malaysian story"*:

```
subject_candidate   = Politik
geography_candidate = Malaysia
final_field         = Politik
```

## Not a Bidang

- **Unclassified** — a `classification_status`. `field` is NULL. Never shown in
  the wheel. (Same reasoning that removed "Semua".)
- **Utama** — Adjung Brief has it; Quick does not. Prominence is the Editorial
  Score's job.

## Future candidate — Agama

Not in v1. Do **not** add a Bidang on a hunch. Collect corpus for 1–2 weeks and
watch for meaningful volume of `JAKIM`, `fatwa`, `masjid`, `haji`, `zakat`,
`Mahkamah Syariah`. If it materialises, add **`Agama`** — not `Syariah`, which
is too narrow for religious affairs generally. None appeared in today's
192-item sample. The architecture must make adding a Bidang cheap.

## Reporting rule

Benchmark must report **subject accuracy separately from residual share**.
Otherwise `Malaysia` becomes a garbage collector that looks like success.
Expect `Malaysia`/`Dunia` to be large early and shrink as content rules improve
— that is the correct direction, precision first.
