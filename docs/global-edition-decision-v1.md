# Adjung Quick — Global Edition Decision v1

Status: `[x] Bahagian B — B1-B5 dijawab Izzat 2026-08-21` — dokumen ini BUKAN spesifikasi
teknikal, BUKAN reka bentuk dari kosong. Ia dokumen keputusan produk selepas
audit keadaan sebenar (kod + docs sedia ada, 2026-08-20/21), disusun ikut
struktur yang dipersetujui ChatGPT (pengarah teknikal, thread "Baca Handoff
Control Plane") selepas audit awal dedah: sebahagian besar seni bina Global
Edition SUDAH terkunci dan SUDAH hidup dalam kod sejak sesi 12-13 Ogos —
dokumen baharu yang re-design dari awal akan buang masa dan berisiko
mengulang keputusan yang dah selesai.

**Peraturan dokumen ini**: Bahagian A cuma REKOD (bukan usul, disahkan
terhadap kod sebenar). Bahagian B ialah SOALAN sebenar untuk Izzat jawab —
Claude/ChatGPT sengaja TAK putuskan sendiri, sebab ini keputusan editorial/
identiti produk, bukan keputusan teknikal (lihat CLAUDE.md, "UI/UX decisions
need approval" — prinsip sama terpakai di sini pada skala lebih besar).
Implementasi kod TAK bermula sehingga B1-B5 dijawab.

---

## Bahagian A — As-Built Global Edition (apa yang sudah wujud)

### A1. Edition Model

✅ Terkunci + hidup dalam kod. Tepat 3 edisi: `ms-MY`, `en-global`,
`ar-global` (`state/editions.js`, `EDITION_IDS`). Satu edisi aktif pada satu
masa, ditukar via Edition Switcher (`ui/src/components/EditionSwitcher.jsx`)
yang menggerakkan `state.editionContext.activeEdition`. **Satu aplikasi,
satu Wheel** — bukan portal berasingan, bukan route berasingan (tiada
router library langsung dalam repo, disahkan grep).

### A2. Content Philosophy

✅ Terkunci — keputusan identiti produk, bukan teknikal. Dipetik terus
daripada Izzat (`docs/edition-source-profile-model.md`, 12 Ogos):
*"saya tak nak Adjung Quick kelihatan seperti portal berasal dari
Malaysia"*. Jadi:

| Edisi | Prinsip |
|---|---|
| ms-MY | kandungan Malaysia |
| en-global | kandungan antarabangsa (gaya BBC/CNN/Al Jazeera) |
| ar-global | kandungan antarabangsa (gaya BBC Arabic/Al Jazeera Arabic) |

**Bukan** "portal Malaysia diterjemah ke English/Arabic". Malaysia-as-
personalization (untuk pembaca yang nak nampak berita Malaysia dalam edisi
lain) ditangguh eksplisit oleh Izzat ke masa depan (login/geolocation),
bukan skop v1.

### A3. Source Model

✅ Terkunci + sebahagian besar SUDAH ingest. RSS bahasa asal edisi tu
sendiri, bukan terjemahan automatik. Disahkan hidup dalam
`lab/sources.js` (diimport terus oleh `db/ingest-production.js` — ini
senarai sumber PRODUCTION, bukan sandbox):

- **en-global**: BBC World, Al Jazeera English, Guardian — sudah wired dan
  ingesting.
- **ar-global**: BBC Arabic, Al Jazeera Arabic — sudah wired dan
  ingesting.
- **Belum ada**: Reuters, AP, DW — gap sumber sebenar, bukan seni bina.

### A4. Taxonomy

✅ Infrastruktur selesai. 45 baris hidup dalam `taxonomy_fields` (16
ms-MY + 16 en-global + 13 ar-global, `db/backfill-taxonomy-fields.mjs`).
Classifier + geography fallback berfungsi untuk ketiga-tiga edisi
(`Dunia` / `World` / `العالم`, `classification/lib/edition-taxonomy.mjs`).

**Penting — bezakan dua lapisan**: infrastruktur taxonomy (skema DB,
loader, fallback) SUDAH selesai untuk ketiga-tiga edisi. Keputusan
EDITORIAL tertentu di dalamnya (macam mana kategori disusun/digabung)
BELUM semua selesai — itu isi Bahagian B1/B2 di bawah.

### A5. Classification & Rules Mechanism

✅ Mekanisme generic siap. Fasa 4 `edition_rules` (resolver + schema +
Admin UI self-service) siap dan hidup merentas SEMUA edisi
(`classification/lib/edition-rules-resolver.mjs`) — editor boleh tambah
rule untuk edisi mana-mana pun dari Admin console hari ni juga.

**Belum**: kandungan rule untuk en-global/ar-global masih KOSONG (cuma
satu rule sistem, `foreign_politics_to_world`, terpakai global). Ini
shovel-ready, bukan kerja seni bina — tunggu B1/B5 dijawab dulu sebab
kandungan rule bergantung pada keputusan taxonomy editorial.

### A6. Ranking

Separa selesai. `editorial_v1` (formula: freshness + sourceTrust +
confidenceModifier + editorialBoost, `docs/ranking-engine-contract-v1.md`)
kini LIVE cuma untuk `ms-MY.Politik`. ~16 kombinasi (edisi × bidang) lain
— termasuk SEMUA en-global/ar-global — masih guna legacy scorer. Enjin
sendiri edition-agnostic (tak perlu dibina semula), cuma kalibrasi per-
edisi belum dijalankan.

---

## Bahagian B — Keputusan (dijawab Izzat, 2026-08-21)

### B1. Culture + Entertainment untuk ar-global — gabung atau asing?

**KEPUTUSAN: ASING.** Culture dan Entertainment kekal dua kategori
berasingan untuk ar-global (bukan gabung macam kunci asal
`edition-architecture-model.md`).

**Syarat tambahan Izzat**: kandungan Hiburan ar-global mesti tetap
ditapis dengan disiplin yang sama seperti versi ms-MY — prinsip Adjung
Quick "portal berita yang bermanfaat dan tidak mengajak kepada
kemungkaran" (CLAUDE.md) terpakai sama rata merentas edisi, bukan cuma
ms-MY.

**Disahkan dalam kod**: mekanisme penapisan (`editorial_filter_rules`,
`state/editorialFilterResolver.mjs`) SUDAH edition-agnostic dan Unicode-
safe untuk Arab — komen kod sendiri eksplisit sebut "Quick also processes
Arabic (ar-global), where \b does not work correctly against non-Latin
scripts" dan guna sempadan Unicode `\p{L}\p{N}\p{M}`, bukan ASCII `\b`.
Jadi ni **gap kandungan sahaja** (senarai frasa tapis Arab belum wujud),
BUKAN kerja seni bina — sama kelas dengan gap `edition_rules` en/ar
(A5). Perlu diauthor bila edisi Arab dilancar.

**Rekod keputusan** (bahasa tepat yang ChatGPT minta direkod, supaya
komen kod lama "LOCKED v1 merge, editorial choice not unanimous
evidence" — yang akan jadi bercanggah selepas Phase 1B — tidak buat
sesiapa di masa depan cuba gabung semula andaikan ini keputusan asal):

> **Decision**: ar-global Culture and Entertainment are intentionally
> separate. **Reason**: Editorial decision by Izzat. Unlike ms-MY, this
> is not a temporary merged taxonomy.

**Status: SELESAI (Global Phase 1B, 2026-08-21).** Kod (fallback
`taxonomy-registry.mjs`) dikemas kini, push `cff3f0f`. Izzat jalankan SQL
production sendiri; disahkan LIVE selepas: `culture_entertainment`
status=archived, `culture`/`entertainment` status=active
(display_order 13/14, tiada collision). `node db/classify-production.js
--write` dijalankan serta-merta selepas (695 baris ditulis merentas
semua edisi — ar-global 48, en-global 93, ms-MY 554, padan tepat output
skrip). `edition_story_classifications` ar-global: culture=1,
entertainment=0, culture_entertainment=0 (bersih, tiada orphan). Nota:
1/0 nipis, tapi ni isu VOLUM SUMBER Arab (cuma BBC Arabic + AJ Arabic
wired setakat ni, per A3), bukan isu split taxonomy — akan bertambah
sihat lepas Phase Global 2 (tambah sumber). Tiada regresi ms-MY/
en-global.

### B2. Ekonomi vs Bisnes untuk ms-MY — gabung atau asing?

**KEPUTUSAN: ASING**, kecuali kedua-dua kategori sebenarnya cuma ada
sikit berita (dalam kes tu kekal gabung supaya tak ada kategori kosong/
nipis). Ambang "sikit" tak ditetapkan sebagai nombor sekarang — ni
keputusan operasi masa pelaksanaan (semak volum sebenar bila nak
laksana), bukan keputusan seni bina.

**Status audit (Global Phase 1A, 2026-08-21)**: data production sebenar
— 37 Business, 28 Economy (57/43), dua-dua substansial. ChatGPT pilih
TANGGUH kunci sehingga 3-5 kitaran ingestion tambahan (elak keputusan
taxonomy kekal atas snapshot satu hari) — bukan tolak split, cuma
tunggu trend disahkan.

### B3. Edition Relevance Layer — perlu wujud atau tidak?

**KEPUTUSAN: TIDAK dibina sekarang**, tapi seni bina MESTI kekal
menyokongnya (extensible) — jangan buat keputusan/struktur kod yang akan
menyekat penambahan lapisan ni kelak. Sistem klasifikasi sekarang
(Classification → Field placement terus, tanpa lapisan Relevance)
diteruskan buat masa ini.

**Kesan untuk implementasi**: bila `edition_rules`/skema klasifikasi
disentuh untuk en-global/ar-global (Fasa Global 3), jangan reka struktur
yang andaikan "setiap cerita diklasifikasi = layak dalam SEMUA edisi
sepadan" sebagai invariant kekal — biar ada ruang tambah gate Relevance
kemudian tanpa migrasi besar.

### B4. Ranking per edisi — kalibrasi bila?

**KEPUTUSAN: SEKARANG**, bukan tunggu data terkumpul dulu. Ini
membalikkan cadangan awal ChatGPT (audit dulu, tunggu corak data sebenar
setiap edisi) — Izzat pilih kalibrasi serentak dengan pelancaran.

### B5. Generalisasi peraturan penempatan (macam `foreign_politics_to_world`)

**KEPUTUSAN: berbeza ikut edisi.**

- **ms-MY**: prinsip macam Nasional/Utama/Mutakhir kekal — peraturan
  editorial manual (macam `foreign_politics_to_world`) terus jadi cara
  utama, sebab sumber ms-MY memang terhad/terkurasi dan boleh diuruskan
  secara manual dengan yakin.
- **en-global/ar-global**: JANGAN generalisasi peraturan penempatan
  manual macam ms-MY. Sebaliknya, berpada dengan maklumat klasifikasi
  yang dibekalkan oleh RSS mentah sumber tu sendiri (kategori/tag asal
  sumber) — sebab bilangan sumber RSS dwibahasa (English+Arabic) jauh
  lebih banyak dan pelbagai berbanding set sumber ms-MY yang terkurasi.
  Skala tu buat peraturan manual per-subjek jadi tak boleh diurus (dan
  tak perlu) macam ms-MY.

**Kesan untuk implementasi**: mengurangkan skop kerja A5/A6 untuk
en-global/ar-global — tak perlu bina banyak `edition_rules` manual untuk
edisi ni, fokus lebih kepada memastikan pemetaan taxonomy terima terus
signal kategori RSS sumber dengan betul (Tier 1/Tier 3 evidence dalam
`classification/story-understanding.mjs`, bukan rule manual tambahan).

---

## Global Phase 1C — Ranking Readiness Audit (2026-08-21, baca-sahaja)

Menjawab B4 secara empirik: adakah enjin ranking (bukan sekadar prinsip
"kalibrasi sekarang") sebenarnya sedia untuk en-global/ar-global? Audit
guna pipeline scoring SEBENAR (`ranking/candidate-scoring.mjs`) terhadap
data production langsung.

**Dapatan utama: TIADA penghadang enjin ranking.** Formula (freshness +
sourceTrust + confidenceModifier + editorialBoost) berfungsi betul untuk
kedua-dua edisi. Setiap jurang yang wujud jejak balik ke **bekalan
sumber**, bukan kecacatan logik skor.

**Peraturan penting (ditegaskan ChatGPT)**: Bezakan **Ranking Readiness**
(adakah enjin sedia) daripada **Content Readiness** (adakah cukup
kandungan). Jangan tafsir corpus kecil sekarang sebagai kesimpulan
tentang saiz pasaran/permintaan pembaca — corpus semasa cuma
menggambarkan sumber yang DAH disambungkan, bukan potensi pasaran
sebenar. Cth: "ar-global cuma 18 berita, jadi pasaran Arab kurang
potensi" ialah kesimpulan yang data ni TAK SOKONG.

### Ranking Engine — status per edisi

| Edisi | Ranking Engine | Status |
|---|---|---|
| ms-MY | Calibrated scorer + `editorial_v1` terhad (Politik sahaja) | Aktif |
| en-global | Calibrated scorer | Sedia |
| ar-global | Calibrated scorer | Sedia secara teknikal |

### Content Readiness — verdict per kategori

Ambang: **READY** = liputan sihat merentas sumber; **THIN** = ada
kandungan tapi bergantung 1-2 sumber/kiraan rendah; **NOT ENOUGH DATA**
= 0-2 item, tak cukup untuk ranking bermakna.

**en-global** (61 calon, sumber: BBC World, Al Jazeera English, Guardian
World):

| Kategori | Status | Kiraan |
|---|---|---|
| World | READY | 22 |
| Politics | READY | 10 |
| Crime | THIN | 4 |
| Business | THIN | 6 |
| Disaster | THIN | 5 |
| Sports | THIN | 4 |
| Environment | THIN | 3 |
| Culture | THIN | 3 |
| Economy | NOT ENOUGH DATA | 2 |
| Health | NOT ENOUGH DATA | 2 |
| Education / Technology / Science / Entertainment / Religion / Lifestyle | NOT ENOUGH DATA | 0 setiap satu |

**ar-global** (18 calon, sumber: BBC Arabic, Al Jazeera Arabic — cuma 2
sumber jumlahnya):

| Kategori | Status | Kiraan |
|---|---|---|
| Politics | THIN | 7 (sempadan) |
| Economy | THIN | 3 (tie-density 66.7%, punca tetap 1 sumber sahaja) |
| Sports | THIN | 4 |
| Disaster / Health-Science / Technology / Culture | NOT ENOUGH DATA | 1 setiap satu |
| Crime / Environment / Education / Entertainment / Religion / Lifestyle | NOT ENOUGH DATA | 0 setiap satu |

Tiada kategori ar-global capai READY lagi — semua jurang jejak balik ke
pendaftaran 2-sumber (per nota di atas, BUKAN pernyataan tentang saiz
pasaran).

### Keputusan: `editorialBoost` — Option A dikunci

`editorialBoost` sekarang **BOOST_WEIGHT = 0** — no-op merentas SEMUA
kombinasi edisi/kategori, termasuk ms-MY.Politik sendiri
(`state/rankingFlags.js:14-18`). Input boost datang dari baris
`story_overrides` tulisan editor — aliran kerja yang, ikut B5, tak wujud
untuk edisi global.

**KEPUTUSAN (dipersetujui ChatGPT selepas semakan bebas, bukan cuma
ikut kecenderungan awal)**: en-global/ar-global lancar dengan **Option
A — calibrated scorer sahaja, tiada editorial composition, tiada manual
boost**. Sebab: mengaktifkan `editorial_v1` hari ni sifar kesan skor
(berat=0) dan tiada proses editorial yang isi ia untuk edisi global —
Option B cuma cipta risiko coupling masa depan bila berat boost ms-MY
akhirnya dilaras naik.

```
Ranking Global v1:

ms-MY:
  - editorial_v1 untuk kategori yang sudah diaktifkan sahaja
  - kategori lain ikut skor standard

en-global:
  - calibrated scorer
  - tiada editorial composition
  - tiada manual boost

ar-global:
  - calibrated scorer
  - tiada editorial composition
  - tiada manual boost
```

**Status: 1C SELESAI, dokumentasi sahaja.** Tiada kod ranking diubah
fasa ni. Langkah seterusnya bukan tambah sumber terus, tapi **Global
Phase 2A — Source Expansion Audit** (jawab dulu: sumber mana paling
bernilai, sumber mana isi kategori kosong, sumber mana bertindih,
minimum sumber diperlukan supaya en-global/ar-global tak nampak kosong
— sebelum tambah sumber sebenar).

---

## Bahagian C — Fasa Pelaksanaan (dikemas kini selepas B1-B5 dijawab)

Cadangan asal ChatGPT: bukan "siapkan English penuh dulu, baru Arabic"
secara automatik — tapi fasa ikut jenis kerja. B4 mengubah satu urutan
(ranking dikalibrasi SEKARANG, bukan ditangguh) — dikemas kini di bawah.

**Phase Global 1 — Stabilize Existing**
Kunci taxonomy ikut B1/B2 (Culture/Entertainment asing untuk ar-global;
Ekonomi/Bisnes asing untuk ms-MY kecuali volum nipis) + pastikan seni
bina klasifikasi kekal menyokong Relevance Layer masa depan (B3, tak
dibina sekarang).

**Phase Global 2 — Content Expansion**
Tambah sumber (Reuters, AP, DW + sumber Arab tambahan). Per B5,
en-global/ar-global TAK perlukan banyak `edition_rules` manual seperti
ms-MY — fokus pastikan taxonomy terima signal kategori RSS sumber asal
dengan betul (bukan bina peraturan manual per-subjek).

**Phase Global 3 — Editorial Intelligence**
Per B4, kalibrasi ranking (`editorial_v1`) untuk en-global/ar-global
berjalan SERENTAK dengan pelancaran, bukan ditangguh sehingga data
terkumpul. Authoring senarai `editorial_filter_rules` Hiburan untuk
ar-global (per B1) turut masuk fasa ni — mekanisme dah siap, ni cuma
kandungan.

**Sengaja TIDAK dimasukkan dalam v1** (supaya dokumen ni tak jadi terlalu
besar, dan sebab semua ni belum jadi bottleneck sebenar):
- Translation pipeline (terjemahan automatik antara edisi)
- AI summarization multi-bahasa
- Source Profile weighting schema (`edition-source-profile-model.md`
  cadang konsep `sourceProfile { eligible_sources[], source_weight }` —
  konsep sahaja, tiada schema, tiada keperluan mendesak)
- RTL redesign penuh (i18n chrome ar-global dah ada, tapi mirroring
  penuh merentas semua komponen belum disahkan visual — perlu semakan
  browser sebenar bila masanya tiba, bukan sekadar grep kod)

---

## Nota audit — staleness dokumen lama

Beberapa dokumen 18 Ogos (Fasa 4 edition-rules) tertulis "not yet
implemented, awaiting review" tapi commit HARI SAMA menunjukkan ia siap
dilaksanakan. Sesiapa baca doc lama sahaja (tanpa semak kod/commit sebenar)
akan overstate berapa banyak kerja yang belum siap. Dokumen ni cuba
betulkan staleness tu dengan sengaja rujuk kod sebenar (bukan doc lain)
untuk setiap tuntutan dalam Bahagian A.
