# Quick Bidang Taxonomy (v1)

> **14 Bidang + 1 PROPOSED.** `Bisnes` was added 2026-08-12 after Izzat
> adjudicated a real borderline case — see *Editorial adjudication rules*
> below. `Bencana` is PROPOSED (not yet locked) — see *Taxonomy Gap Round*
> below, pending Izzat's approval.

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

## Taxonomy Gap Round (2026-08-12) — PROPOSED: add Bencana

Discovered while drafting the 190-item benchmark labels: 56% came back
flagged uncertain, but 38 of those weren't labelling disputes at all — they
were stories with genuinely no home in the 14 Bidang. Two patterns dominated:
acute disasters (Colombia earthquake, 254+ dead; Beijing/Assam flooding;
Zimbabwe ferry capsize) and active conflict (Iran-US/Hormuz tension,
Yemen-Houthi, Gaza, Ukraine arms funding, North Korea missile tests, Sudan).
ChatGPT's ruling (0.97 / 0.94):

### `Bencana` — approved as a new Bidang, PROPOSED pending Izzat

Acute disaster/emergency: earthquake, flood, shipwreck, landslide, major fire,
volcanic eruption, major accident. Deliberately **separate from `Alam
Sekitar`**, which stays about climate/pollution/haze/conservation — an ongoing
condition, not a single acute event.

| Headline | Bidang |
|---|---|
| "Jerebu tutup sekolah" | Alam Sekitar |
| "Gempa bumi, 254 mati" | **Bencana** |
| "Banjir besar meragut nyawa" | **Bencana** |
| "Polisi kurangkan karbon" | Alam Sekitar |

### Conflict/War — NOT a new Bidang. Stays `Politik` + an attribute

War coverage resists a single Bidang because it's never just one thing — a
Ukraine story might be politics, security, military, or conflict depending on
angle; a Gaza story might be politics, conflict, or humanitarian. Forcing a
`Peperangan` Bidang risks the classifier keying on "sounds violent →
Peperangan", which isn't a real subject rule.

Decision: keep `field = Politik` for these stories, and add a secondary,
non-exclusive **attribute** dimension (e.g. `["Konflik", "Antarabangsa"]`) —
not part of `field`, doesn't compete with the single-Bidang model, but lets a
future UI or query distinguish "routine domestic politics" from "active
conflict reporting" without another Bidang. Not yet implemented in schema;
recorded here as the decided direction.

### Warning: `Dunia` was becoming a dumping ground

The gap review surfaced a real pattern — `Dunia` was absorbing disasters, wars,
and foreign politics that all actually belonged somewhere once `Bencana`
exists and `Politik` is confirmed global. `Dunia` must stay **pure residual
geography**: a story with no subject match at all (e.g. "Japan announces new
tourism rules"). "Earthquake kills 254" → `Bencana`, not `Dunia`.
"Lebanon parliament vote" → `Politik`, not `Dunia`.

### Redefined target: not 1% of all stories, ~1% after taxonomy+rules mature

Izzat's original target — iterate until only ~1% of stories are ambiguous —
holds, but the definition sharpens: not "1% of all 190 have zero possible
debate" (near-impossible), but *1% remain unplaceable after the taxonomy is
right and rules are mature*. Some boundary will always remain (SPRM-style
politician-identity cases, government-linked companies, an artist entering
politics, climate-driven disasters) — that's normal, not a failure.

### Four-round plan to get there

1. **Taxonomy Gap** (this round) — find genuinely missing categories. Don't
   finalize labels yet.
2. **Subject Boundary** — bring the 69 real boundary cases to Izzat, once
   taxonomy is stable (categories like Politik vs Jenayah, Ekonomi vs
   Teknologi, Budaya vs Hiburan, Alam Sekitar vs Bencana).
3. **Rule Design** — build desk mapping, category mapping, phrase rules,
   exclusions. Only after boundary cases are resolved.
4. **Holdout Validation** — test against *new* RSS never seen during rule
   authoring, not the same 190 items. That's the real benchmark.

Labelling the 190-item corpus is paused until this taxonomy gap round closes
— continuing now would force the 38 gap items into `Dunia`, then invalidate
those labels the moment `Bencana` is approved, corrupting the benchmark before
it starts.

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
