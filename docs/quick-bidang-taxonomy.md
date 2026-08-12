# Quick Bidang Taxonomy (v1)

> **14 Bidang.** `Bisnes` was added 2026-08-12 after Izzat adjudicated a real
> borderline case — see *Editorial adjudication rules* below, which is the
> authoritative statement of how classification decisions are made.

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
| **Ekonomi** | macro economy: ringgit, inflation, GDP, subsidies, fiscal policy | `ekonomi`, `economy`, `اقتصاد` |
| **Bisnes** | individual companies, corporate results, property, deals | `business`, `ebusiness` |
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

## Editorial adjudication rules (Izzat, 2026-08-12)

Izzat ruled on three real borderline cases from the corpus. The rulings imply
principles that govern the classifier, not just those three stories.

| Story | Ruling | Principle |
|---|---|---|
| "SPRM cari Po Lian dan Jennifer, mahkamah keluarkan waran tangkap" | **Depends** — if Po Lian is a politician → `Politik`; if not → `Jenayah`. And *"kena rujuk brief juga"* | Actor identity can decide the Bidang; the **title alone is not enough**, the brief/description must be read |
| "Kanopi Residences capai kadar pengambilan 90 peratus" | **`Bisnes`** (not Ekonomi) | A single company's performance is `Bisnes`. `Ekonomi` is the macro picture |
| "Tun Dr Mahathir, Siti Hasmah cipta rekod ASEAN pasangan tertua" | **`Malaysia`** — *"walaupun dia seorang ahli politik tp di sini bukan nak cerita politik"* | Classify by **what the story is about**, not who appears in it |

### The governing principle

> **Classify by what the story is about — not by who appears in it.**

A politician appearing does not make a story `Politik`. Mahathir setting a
marriage-longevity record is human interest → residual `Malaysia`. But the SPRM
case *is* about a person's conduct in their public capacity, so if the subject
is a politician it becomes `Politik`.

Combined test: *is the story about the actor's political role?* If yes →
`Politik`. If a politician merely features → judge on the story's actual topic.

### ⚠ Architectural consequence: this needs entity knowledge

"Is Po Lian a politician?" cannot be answered by keywords. A purely
text-deterministic classifier has no way to know. Options, none free:

1. **Maintained entity registry** — a curated list of politicians/parties/
   officeholders, checked against the title+brief. Deterministic and auditable
   (fits the no-AI constraint), but someone must maintain it, and it will always
   lag new names.
2. **Role-phrase detection** — match the *descriptors* that accompany names in
   Malay reporting (`Ahli Parlimen`, `Menteri`, `ADUN`, `Datuk Seri … Menteri`,
   `bekas Perdana Menteri`). Doesn't need to know the person, only how they are
   introduced. Cheaper, and Malay news usually states the role.
3. **Accept the limit** — treat these as `Jenayah` by default and let the
   residual/Unclassified path absorb the ambiguity.

Recommendation: **(2) role-phrase detection**, since Malay wire copy nearly
always names the role, with (1) reserved for a small list of very high-profile
figures. Open for ChatGPT's audit — flagged because it materially affects how
Tier-4 content rules must be built.

### Must read the brief, not just the title

Izzat's *"kena rujuk brief juga"* confirms the classifier must consume title
**and** description. `lab/classify.js` already does this; the production path
must preserve it, and the benchmark must label from title+brief too — not
headline alone.

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
