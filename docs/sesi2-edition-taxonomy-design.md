# Sesi 2 — Edition Taxonomy Design (bottom-up, real reference portals)

Status: DRAFT, built from live navigation menus of real reference outlets —
per ChatGPT's correction, this starts from each edition's real editorial
experience, not from the Story Understanding subject list downward.

## Real navigation captured 2026-08-12

### ms-MY

| Astro Awani | Harian Metro | Berita Harian |
|---|---|---|
| Malaysia | Utama | Berita |
| Dunia | Mutakhir | Sukan |
| Politik | Global | Dunia |
| Hiburan | Arena (=Sukan) | Hiburan |
| Bisnes | Rap/Rapxtra | Bisnes |
| Sukan | Bisnes | Rencana |
| Rancangan | MetroTV | Gaya Hidup |
| Gaya Hidup | Akademia (=Pendidikan) | Sihat |
| Lain-Lain | #ITMetro (=Teknologi) | #MariLokal |
| | Ku Bela, Santai, P&P, Dekotaman, WM, Addin (=Agama), Rencana, Sihat, Xpresi, Vroom, PKS, Agro, Spektrum, Galeri, Infografik | |

### English

| BBC | Al Jazeera English |
|---|---|
| News, Sport, Business, Technology, Health, Culture, Arts, Travel, Earth | News, Sports, Opinion, Features, Economy, Human Rights, Climate Crisis, Investigations, Science and Technology, Travel |
| **Geography row (separate):** US & Canada, UK, Africa, Asia, Australia, Europe, Latin America, Middle East | **Geography (separate "where" tags):** Middle East, and per-country tags (Palestine, Iran, Yemen, Syria, Lebanon, Ukraine, ...) |

### Arabic

| Al Jazeera Arabic | BBC Arabic | Al Araby (العربي الجديد) | العالم العربي اليوم (business wire) |
|---|---|---|---|
| أخبار (News), اقتصاد (Economy), رياضة (Sport), آراء (Opinions), أبعاد (Analysis/Dimensions), نبض (Pulse/Trending), محليات (Local) | أخبار (News), اقتصاد (Economy), **صحة وعلوم (Health+Science)**, **ثقافة وفنون (Culture+Arts/Entertainment)**, رياضة (Sport), تحقيقات (Investigations) | أخبار (News), **سياسة (Politics — separate!)**, اقتصاد (Economy), مقالات (Opinion), مجتمع (Society), منوعات (Entertainment/Miscellaneous), **ثقافة (Culture — kept separate!)**, رياضة (Sport), تحقيقات (Investigations) | بنوك وتأمين (Banking/Insurance), قطاع أعمال (Business Sector), بترول وطاقة (Oil/Energy), أسواق وتموين (Markets/Supply), بورصة (Stock Exchange), سياحة وموانئ (Tourism/Ports), عقارات (Real Estate), أتصالات وتكنولوجيا (Telecom/Tech), نقل (Transport) |
| **Geography (separate "where" tags):** per-country (Palestine, Iran, Yemen, Syria, Lebanon), plus regional | | | *(specialized business wire, not a general-news reference — evidence that Arabic business coverage CAN subdivide finely when the outlet is business-focused; not used for the general Arabic edition taxonomy)* |

**Sixth Arabic source** (`elalmelarby.com`, general Egyptian outlet): أخبار عاجلة
(Breaking News), رياضة (Sport), منوعات (Entertainment/Misc), إقتصاد (Economy),
العالم (World — geography), **تعليم (Education — separate!)**. First Arabic
source with an explicit Education nav item, real evidence `Education` deserves
its own Arabic display term rather than defaulting to "TBD" in the mapping
matrix. No Politics, Culture, or Health/Science split here either — smaller
outlets seem to run leaner top-level navs than AJ/BBC Arabic.

**Contradiction found, not glossed over:** Al Araby keeps `ثقافة` (Culture) and
`منوعات` (Entertainment) **separate**, and is the only one of the four with an
explicit `سياسة` (Politics) top-level item distinct from `أخبار` (News). This
makes the Culture/Entertainment merge 2-for (AJ Arabic, BBC Arabic) vs 1-against
(Al Araby), not unanimous. Real Arabic outlets genuinely disagree on this
structure — same pattern already seen in ms-MY (Astro Awani vs. Harian Metro's
very different structures) and consistent with the earlier corpus finding that
"source behaviour sangat berbeza." Recommendation: keep the merge as
Quick's Arabic edition default (majority pattern, and Al Jazeera/BBC Arabic are
closer to Quick's intended general-news tone than Al Araby specifically), but
flag it as a genuine editorial choice, not a discovered fact — Izzat/ChatGPT
should make the call knowingly, not because "the evidence says so" without
qualification.

## Findings that revise earlier documents

### 1. Subject/Geography split is real, not an invented abstraction

BBC and Al Jazeera English **both** independently run a subject-based top nav
row with a geography-based row underneath as a *visually distinct, separate*
navigation group. Al Jazeera Arabic and BBC Arabic both tag stories by
country/region separately from subject too. This isn't a Quick-invented
ontology — it's literally how two of the world's largest news organizations
already structure their sites, in both languages tested. Strong independent
validation of `universal-classification-model.md`'s Subject/Geography split.

### 2. Arabic merges TWO pairs, not one — confirmed by a second outlet

Previously (`edition-mapping-matrix-en-ar.md`) the Culture/Entertainment merge
for Arabic rested on a single AJ Arabic desk (`فن`) covering both a heritage
feature and a celebrity story — flagged medium-confidence, single-source.
**BBC Arabic's real nav independently confirms this merge** (`ثقافة وفنون`)
AND reveals a second, previously undetected merge: **Health + Science**
(`صحة وعلوم`). Two major outlets agreeing raises this from "proposed" to
corpus-and-navigation-confirmed. Update: Arabic edition merges both
Culture+Entertainment AND Health+Science as display categories, while the
Universal layer keeps all four subjects genuinely separate.

### 3. ms-MY real portals don't split Business from Economy — open question

None of the three real ms-MY portals (Astro Awani, Harian Metro, Berita
Harian) show both `Ekonomi` and `Bisnes` as distinct top-level nav items —
all three show only `Bisnes`. This doesn't contradict the Universal layer
(Business/Economy stay separate subjects, per Izzat's locked Kanopi Residences
ruling — that's a real subject-level distinction). But it raises a genuine
question for the **ms-MY edition's display**: does the reader expect to see
`Ekonomi` and `Bisnes` as two separate Wheel entries, or does ms-MY display
them merged under one `Bisnes` label the way real Malay portals do, with the
underlying subject distinction preserved only in the data (not the Wheel)?
**Flagged for Izzat/ChatGPT — not decided here.**

### 4. Real top-level navs are coarser than a flat 15-subject list

No single reference portal exposes 15 top-level categories. BBC: 9. Al
Jazeera English: ~10 (excluding geography tags). ms-MY portals: 6–9 (Harian
Metro's ~20 is an outlier — heavily branded/magazine-style, not a clean subject
taxonomy, and probably shouldn't be copied structurally even though its
*content* mapped cleanly earlier: Arena=Sukan, Sihat=Kesihatan, Akademia=
Pendidikan, Addin=Agama, #ITMetro=Teknologi). Confirms ChatGPT's warning:
Universal Subject count and Edition display-category count are not the same
number — editions coarsen and combine.

### 5. New real category not in the Universal list: Human Rights / Climate Crisis (AJ English)

`Human Rights` and `Climate Crisis` are real, recurring Al Jazeera English nav
items. `Climate Crisis` maps cleanly to `Environment`. `Human Rights` doesn't
map cleanly to any single existing Subject — closer to an `Attribute` (like
`Humanitarian`, already in the Event/Attribute list) than a new Subject.
Recommend: don't add a 16th Subject for this; confirm `Humanitarian` attribute
covers it.

### 6. `Addin` (Religion) has real precedent — but only in one of three ms-MY portals

Harian Metro runs `Addin` as a real nav section. This is real evidence for
eventually promoting `Agama` out of "future candidate" status for ms-MY, but
it's only 1 of 3 portals — not yet the "meaningful volume across sources"
bar `quick-bidang-taxonomy.md` set for promoting it. Stays future candidate.

## Not yet done

- Bernama's real navigation (not fetched — Bernama's site structure differs
  significantly from the others, may need separate handling since it's a
  wire service, not a consumer portal).
- CNN's real navigation (BBC was sufficient to confirm the Subject/Geography
  split pattern; CNN not fetched — lower priority now that the pattern is
  independently confirmed by 2 English + 2 Arabic outlets).

## Recommendation before locking Edition Taxonomy v1

1. Izzat/ChatGPT decide the Ekonomi/Bisnes ms-MY display question (#3 above).
2. Confirm Arabic's double merge (#2) as locked.
3. Confirm `Human Rights` → `Humanitarian` attribute, not a new Subject (#5).
4. Then produce the final per-edition display taxonomy (replaces
   `edition-taxonomy-v0.1.md`'s table), and only then resume the paused
   Round 2 boundary cases against it.
