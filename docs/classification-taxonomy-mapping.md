# Classification Taxonomy & Mapping Matrix

Status: **EVIDENCE + OPEN DECISION** — needs Izzat's sign-off before any
classifier is implemented. Per ChatGPT's Sesi 1 instruction: build this
document *first*, and do not lock the 24 Adjung Brief Bidang until the mapping
matrix shows they actually fit.

All figures below come from a live fetch of all 9 sources on 2026-08-12
(192 items). Reproduce with:

```bash
node classification/extract-corpus.mjs
node classification/analyse-coverage.mjs
```

---

## Finding 1 — RSS metadata alone can only classify 15% of stories

Izzat asked: *"bukan ke kita ikut bidang yg dibekalkan oleh RSS?"* The honest
answer, measured: we can't, because most stories don't carry a subject.

| Signal quality | Items | Share |
|---|---|---|
| **SUBJECT** (usable for Bidang) | **28** | **15%** |
| GEOGRAPHIC only (tells us *where*, not *what*) | 61 | 32% |
| NO SIGNAL (structural: `mutakhir`, `news`, `BERITA`) | 102 | 53% |
| Unmapped value | 1 | 1% |

Per source:

| Source | Subject-bearing | Notes |
|---|---|---|
| Al Jazeera Arabic | 14/25 | best in the set — clean `politics`/`sport`/`science` desks |
| The Guardian World | 7/45 | 38 items are geographic (`world`, `us-news`, `uk-news`) |
| Utusan Malaysia | 3/10 | `ekonomi`, `gaya/hiburan`, `nasional/politik` |
| Astro Awani | 2/10 | `berita-politik`; the rest is `berita-malaysia` (geographic) |
| Al Jazeera English | 2/25 | desks are mostly `video/newsfeed`, `news` |
| Kosmo Digital | 0/10 | only `Negara` (geographic) |
| Harian Metro | 0/20 | every item `mutakhir` = "latest" |
| BBC News World | 0/21 | `news/articles` only |
| BBC Arabic | 0/26 | `arabic/articles` only |

**Consequence:** a desk-mapping registry is still worth building (it is the most
*reliable* signal where present), but Tier-4 deterministic content rules must
carry ~85% of the load. The engine is mostly a content classifier, and we should
plan resources accordingly.

## Finding 2 — Newsroom desks and Adjung Bidang are different *kinds* of thing

Newsrooms organise by **geography + section**. Adjung Bidang is a **subject**
taxonomy. That's why 32% of our signal is "geographic only" — `world`,
`us-news`, `nasional`, `Negara`, `berita-malaysia` tell us nothing about subject.

This is a structural mismatch, not a data-quality problem. No amount of desk
mapping fixes it.

## Finding 3 — The 24 Adjung Brief Bidang do not fit daily news

This is the most important finding, and it's a **product decision for Izzat**.

The 24 live Bidang (from Adjung Brief's `CategoryRegistry`): Al-Quran dan
Sunnah, Alam Sekitar, Angkasa, Bahasa, Bisnes, Budaya, Ekonomi, Falsafah,
Geografi, Geopolitik, Malaysiana, Matematik, Pendidikan, Perubatan,
Perundangan, Psikologi, Sains, Sastera, Sejarah, Seni Reka Bentuk, Sukan,
Syariah, Teknologi, Utama.

That vocabulary was built for **essays and knowledge writing** — Adjung Brief's
content. Quick reads **daily news wire**. Here is real output from today's feeds
against it:

| Real headline (today) | Fits which of the 24? |
|---|---|
| "Empat penghuni pusat jagaan didakwa bunuh, sebabkan kematian rakan" | ✗ (crime — closest `Perundangan`, but that's law-as-subject) |
| "Sangka anak pulang lewat, rupanya lemas di Sungai Kelantan" | ✗ none |
| "Penjual burger dituduh rogol budak 12 tahun" | ✗ none |
| "Lebih ramai Ahli Parlimen 'menyusul', pintu Bersama sentiasa terbuka – Rafizi" | ✗ **no `Politik` exists** |
| "Wong Chen umum keluar PKR, sertai Bersama" | ✗ **no `Politik` exists** |
| "Wanita mengaku bersalah anjur kumpulan wang kutu, kerugian RM1 juta" | ✗ (fraud) |
| "SPRM cari Po Lian dan Jennifer, mahkamah keluarkan waran tangkap" | ✗ (crime) |
| "Promosi judi dalam talian: Pempengaruh terlepas penjara" | ✗ (crime) |
| "Jerebu: Enam sekolah di Tebedu, Sarawak ditutup" | ✓ `Alam Sekitar` |
| "Kanopi Residences capai kadar pengambilan 90 peratus" | ✓ `Bisnes` |

**Two gaps are decisive:**

1. **No `Politik`.** Domestic party politics is one of the largest slices of
   Malaysian daily news. `Geopolitik` is international relations — not the same
   thing. `Malaysiana` reads as culture/heritage, not party politics.
2. **No `Jenayah` (crime/courts).** Looking at Harian Metro and Kosmo, crime and
   court reporting is plausibly the single biggest category in the corpus.
   `Perundangan` is law as a field of study, not "man charged with murder".

Also missing for a news product: `Kesihatan` (public health — `Perubatan` is
medicine-as-discipline), `Hiburan`, `Bencana`/`Kemalangan`.

Conversely, several of the 24 will almost never fire on a news wire:
`Matematik`, `Falsafah`, `Sastera`, `Bahasa`, `Angkasa`, `Seni Reka Bentuk`.

**Reusing all 24 unchanged would produce a wheel where most Bidang are
permanently empty and the largest real categories have nowhere to go.**

---

## The decision Izzat needs to make

ChatGPT's constraint: use Adjung Brief's taxonomy as the *candidate* vocabulary
to avoid Quick inventing its own terms — but don't lock it if it doesn't fit.
The evidence says it doesn't fit unchanged. Options:

**Option A — Adjung 24 + news additions.** Keep the Adjung vocabulary for
consistency across Adjung Press, add the missing news Bidang (`Politik`,
`Jenayah`, `Kesihatan`, `Hiburan`, …). Cost: Quick's list diverges from Brief's
anyway, and dormant Bidang (`Matematik`, `Falsafah`) still clutter the wheel.

**Option B — A dedicated Quick news taxonomy.** A short list built for a daily
news wire (e.g. Politik, Jenayah, Ekonomi, Sukan, Alam Sekitar, Kesihatan,
Hiburan, Teknologi, Dunia, Malaysia). Maps cleanly onto what sources actually
emit. Cost: two vocabularies inside Adjung Press; a Brief↔Quick mapping needed
later if content is ever shared.

**Option C — Adjung 24 unchanged.** Maximum consistency; but per the table
above most of today's stories would be Unclassified, and the wheel would be
mostly empty Bidang. Not recommended on this evidence.

Recommendation: **Option B**, then map Quick's list onto Adjung's 24 later if
Brief integration ever needs it. Quick is a news reader; Brief is an essay
platform. Forcing one vocabulary across both is what produces the mismatch
above. But the final call is Izzat's — this is product semantics, not
implementation.

---

## Mapping registry (draft — activates once the Bidang list is fixed)

Shape, per ChatGPT: `SOURCE DESK → NORMALIZED DESK → QUICK BIDANG`, held as
data, never as if/else. Normalized desks observed in the live corpus:

| Source | Raw desk | Normalized | → Bidang (pending list) |
|---|---|---|---|
| Utusan | `ekonomi` | `economy` | Ekonomi |
| Utusan | `nasional/politik` | `politics` | Politik |
| Utusan | `gaya/hiburan` | `entertainment` | Hiburan |
| Astro Awani | `berita-politik` | `politics` | Politik |
| Astro Awani | `berita-dunia` | `world` | *(geographic — see Finding 2)* |
| Guardian | `business` | `business` | Ekonomi / Bisnes |
| Guardian | `environment` | `environment` | Alam Sekitar |
| Guardian | `football` | `sport` | Sukan |
| Guardian | `food`, `travel` | `lifestyle` | *(no home yet)* |
| Al Jazeera AR | `politics` / `سياسة` | `politics` | Politik |
| Al Jazeera AR | `sport` / `رياضة` | `sport` | Sukan |
| Al Jazeera AR | `ebusiness` / `اقتصاد` | `economy` | Ekonomi |
| Al Jazeera AR | `science` / `علوم` | `science` | Sains |
| Al Jazeera AR | `tech` / `تكنولوجيا` | `technology` | Teknologi |
| Al Jazeera AR | `arts` / `فن` | `arts` | Budaya / Seni |
| Al Jazeera EN | `sports` | `sport` | Sukan |
| Al Jazeera EN | `economy` | `economy` | Ekonomi |
| Kosmo | `Negara` (cat[0]) | `national` | *(geographic)* |
| Utusan | `NASIONAL`, `Asia Barat` | `national`, `west-asia` | *(geographic)* |

Explicitly **not** desks (must never map to a Bidang): `mutakhir`, `terkini`,
`berita`, `news`, `news/articles`, `news/videos`, `news/liveblog`,
`video/newsfeed`, `features/longform`, `arabic/articles`, `BERITA`, `News`,
`Newsfeed`, `Show Types`, `TV News`, `أخبار`.

## Schema audit (current state)

`story_clusters` today:

```sql
topic TEXT NOT NULL DEFAULT 'Unclassified'
```

Two problems against ChatGPT's requirements:

1. **No evidence columns.** There is nowhere to record
   `classification_method`, `classification_rule`, or
   `classification_confidence`. Without these, "why is this story in Sains?" is
   unanswerable.
2. **`Unclassified` is stored as a topic value**, contradicting "Unclassified is
   a status, not a Bidang". Needs a separate `classification_status`.

`rss_items` **does not persist `categories` at all** — `lab/rss.js` parses
`<category>` but the value is dropped before insert. The Tier-2 signal is
currently thrown away and would need to be stored for the classifier to use it
in production.

No migration written yet — per ChatGPT, audit before migrating.

## Next steps (blocked on the Bidang decision)

1. ⛔ **Izzat decides the Bidang list** (Option A / B / C above)
2. Build the labelled benchmark from the 192-item corpus
3. Implement source adapters (report desk only) + one canonical classifier
4. Calibrate confidence thresholds against the benchmark
5. Report accuracy, per-field precision/recall, confusion matrix, per-source
   accuracy — never "Unclassified went down"
