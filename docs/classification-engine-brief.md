# Classification Engine — Design Brief

Source: ChatGPT (project director), 2026-08-12, after Izzat's directive to stop
UI/UX work and build the classification engine first. Confidence: 0.97.

**Roadmap was re-ordered.** Classification Engine is now Sesi 1; real-device UI
acceptance is deferred to Sesi 4. Do not touch UI except for bugs that block
engine/integration work.

## The one rule that matters most

> Jangan ukur kejayaan classifier berdasarkan berapa banyak berita berjaya
> dipaksa keluar daripada Unclassified. **Ukur berdasarkan ketepatan Bidang.**

20% correctly-Unclassified beats 100% classified with 30% in the wrong Bidang —
a wrong Bidang corrupts the whole Quick Wheel.

**No AI. No API. No LLM.** Deterministic only (Izzat's locked "no AI in Adjung").

## Pipeline — layered, not one classifier

```
RSS item
   │
   ├── 1. Source / Feed Desk      URL path, feed identity
   ├── 2. RSS Category            <category>[0]
   ├── 3. Source normalization    "nasional/politik" → politics
   ├── 4. Title/Description rules deterministic keywords + phrases
   ├── 5. Context rules           combinations / exclusions
   └── 6. Unclassified
```

### Trust tiers

| Tier | Signal | Example |
|---|---|---|
| 1 | Explicit source desk (URL/feed) | Astro Awani `berita-politik` → Politik; Guardian `environment` → Alam Sekitar |
| 2 | RSS `<category>[0]` | Al Jazeera AR `رياضة` → Sukan |
| 3 | Feed-level identity | BBC World feed → World. **Never** use publisher name as the field. |
| 4 | Deterministic content rules | title + description + normalized desk, with phrase/exclusion/combination rules |

Do not blindly trust a source desk at 100%. Guardian `world` is very strong;
Kosmo `Negara` does not mean every article in that feed shares one Bidang.

### Content rules need phrases + context, not a dumb keyword list

- `parlimen`, `menteri`, `kerajaan`, `PRU` → Politik
- `bank`, `ringgit`, `KLCI` → Ekonomi
- `kes mahkamah` is **not** automatically Jenayah — context decides

## Every decision carries evidence

Each classification must record why:

```
field                     = "Sains"
classification_method     = "source_desk" | "rss_category" | "content_rule" | "feed_identity"
classification_rule       = "aljazeera.science"
classification_confidence = 0.98
```

Confidence is internal metadata — never shown to the reader. If 40 stories
suddenly land in Sains, we must be able to name the rule that did it.

Bands (indicative — **do not fix thresholds yet**, calibrate against the real
191+ item corpus first):

```
90–100  High
70–89   Medium
50–69   Low
<50     Unclassified
```

## Unclassified is not a Bidang

It is a technical/editorial safety state, not a category:

```
classification_status: classified | unclassified
```

The UI shows only real Bidang. This mirrors removing "Semua" — neither "Semua"
nor "Unclassified" is a Bidang. Access to unclassified stories, if ever needed,
is a separate discovery/admin mechanism.

## Do NOT lock the 24 Adjung Brief Bidang yet

Use Adjung Brief's taxonomy as the **candidate** canonical vocabulary (avoids
Quick inventing its own terms), but audit before locking:

```
24 Adjung Brief fields → mapping matrix → 9 RSS sources
→ actual desk/category distribution → identify gaps → Izzat confirms final list
```

Quick is not Adjung Brief. Real RSS produces `environment`, `climate`,
`science`, `technology`, `football`, `business`, `politics`, `world` — we must
check each has a natural home. Don't create a Bidang just because the name
exists in the old registry.

## Mapping registry is data, not if/else

```
SOURCE DESK → NORMALIZED DESK → QUICK FIELD

Utusan   nasional/politik → politics    → Politik
Guardian environment      → environment → Alam Sekitar
AJ-AR    رياضة            → sport       → Sukan
```

## Source adapters, one canonical classifier

Source behaviour genuinely differs (proven live), so per-source adapters are
justified:

```
classification/sources/{kosmo,utusan,astro-awani,guardian,aljazeera-ar,...}.js
```

But do **not** duplicate the classifier. An adapter only answers *"what
desk/category does this source give?"*. The canonical classifier answers
*"what Quick Bidang does that desk mean?"*.

## Data model

Probably just metadata on `story_clusters` (`field`,
`classification_method`, `classification_confidence`, `classification_rule`) —
but **audit the current schema before migrating anything**. Don't add a table
just because it's convenient.

## Benchmark — the most important part

Build a labelled benchmark from real RSS, then report:

- Overall accuracy
- Unclassified rate
- Per-field precision / recall
- Confusion matrix
- **Source-by-source accuracy** (e.g. Utusan 96%, AJ-AR 100%, Guardian 94%,
  Kosmo 81%, Harian Metro 63%)

"Classifier nampak lebih baik" is not evidence.

## Revised roadmap

| Sesi | Fokus |
|---|---|
| 1 | **Classification Engine** ← now |
| 2 | Classification Calibration (real RSS, confusion matrix, source gaps) |
| 3 | Production Ingestion (mature classifier goes in) |
| 4 | Real Device Reading Acceptance (the deferred 9/11 wheel+reading checks) |
| 5 | Save + Login |
| 6 | History + Expiry |
| 7 | Language |
| 8 | Sponsor |
| 9 | Theme + Search/Filter |
| 10 | Production Release Audit |

## Immediate order of work

1. Audit `lab/classify.js`
2. Audit current `story_clusters` schema
3. Extract every desk/category from all 9 RSS sources
4. Write the Classification Taxonomy/Mapping design document **first**
5. Build the benchmark from real RSS
6. Don't lock 24 Bidang until the mapping matrix justifies it
7. Only then implement the deterministic classifier
8. Keep Unclassified as fallback; no AI/API
9. Don't change Engine selection, Active Set, Wheel, or UI

## Evidence already gathered (2026-08-12, live fetch of all 9 sources)

`<category>` presence:

| Source | Coverage | Sample |
|---|---|---|
| Kosmo | 10/10 | `Negara \| kematian \| MAHKAMAH \| tanjung rambutan` |
| Utusan | 10/10 | `BERITA \| NASIONAL \| Politik \| TERKINI` |
| Harian Metro | 0/20 | — |
| Astro Awani | 0/10 | — |
| BBC World | 0/21 | — |
| Al Jazeera EN | 25/25 | `News` (low value) |
| Guardian | 45/45 | `Spain \| Italy \| Migration \| Africa \| Europe` |
| BBC Arabic | 0/26 | — |
| Al Jazeera AR | 25/25 | `رياضة`, `اقتصاد`, `سياسة` (clean) |

URL-path desk:

| Source | Desks observed |
|---|---|
| Utusan | `nasional`(6), `nasional/politik`, `gaya/hiburan`, `terkini`, `berita` |
| Astro Awani | `berita-malaysia`(6), `berita-politik`(2), `berita-dunia`, `berita-bisnes` |
| Guardian | `world`(16), `us-news`(10), `uk-news`(4), `australia-news`(4), `business`(2), `environment`(2), `football`, `travel`, `food` |
| Al Jazeera AR | `news`(13), `sport`(3), `politics`(3), `arts`(2), `ebusiness`, `science`, `tech`, `opinions` |
| Al Jazeera EN | `video/newsfeed`(12), `news`(9), `sports`, `economy`, `features/longform` |
| Kosmo | `(root)` — nothing; use `<category>[0]` |
| Harian Metro | all `mutakhir` (= "latest", not a desk) — **no desk signal** |
| BBC Arabic | all `arabic/articles` — **no desk signal** |
| BBC World | `news/articles`, `news/videos` — feed identity is the only signal |
