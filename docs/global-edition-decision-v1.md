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

## Global Phase 2A — Source Expansion Audit (2026-08-21, baca-sahaja)

Audit sahaja — **tiada kod diubah, tiada sumber ditambah fasa ni.**
Data production live (snapshot 2026-08-21): en-global 93 baris
diklasifikasi (34% belum diklasifikasi), ar-global 48 baris (63% belum
diklasifikasi — nisbah tinggi ni flag kualiti data BERASINGAN, bukan
isu liputan kategori dalam skop dokumen ni).

### A. Jurang bekalan semasa

**en-global** (sumber: BBC News World, Al Jazeera English, Guardian
World, ketiga-tiganya `sourceType: 'general'`, TIADA `knownCategory` —
liputan sepenuhnya bergantung tafsiran classifier):

| Kategori | Status | Punca |
|---|---|---|
| World | Sihat (22) | Hampir semua dari Guardian sahaja — risiko tumpuan |
| Politics | Memadai (10) | Tersebar 3 sumber — kategori paling sihat |
| Business, Disaster, Crime, Culture, Environment | Nipis (3-6) | Setiap satu bergantung ~100% pada SATU sumber |
| Economy, Health | Sangat nipis (2) | Sama |
| Education, Technology, Science, Entertainment, Religion, Lifestyle | **Kosong (0)** | Tiada sumber wired liputi bidang ni langsung |

**ar-global** (sumber: BBC Arabic, Al Jazeera Arabic sahaja, kedua-dua
`general`, tiada `knownCategory`):

| Kategori | Status | Punca |
|---|---|---|
| Politics (سياسة) | Memadai (7) | 6/7 dari Al Jazeera Arabic — risiko tumpuan tinggi |
| Sports, Economy | Nipis (3-4) | Economy 100% dari satu sumber |
| Culture, Disaster, Health-Science, Technology | Sangat nipis (1 setiap satu) | Satu item, satu sumber — anekdot, bukan liputan sebenar |
| Crime, Environment, Education, Entertainment, Religion, Lifestyle, World | **Kosong (0)** | Tiada sumber Arab wired liputi 7 bidang ni langsung |

### B. Prinsip penilaian sumber

Bukan "mesti label rasmi" secara rigid — kriteria sebenar: **mesti feed
yang dikawal/dimiliki sumber itu sendiri, bukan proksi pihak ketiga yang
scrape/tiru mereka.** Sama disiplin yang dipakai kesemua sumber ms-MY
sedia ada (Utusan/RTM/Astro Awani — feed terus dari portal sendiri).
Proksi pihak ketiga ditolak sebab boleh rosak senyap bila-bila masa,
tiada jaminan ketepatan daripada sumber asal, dan bermasalah dari segi
kebenaran guna kandungan.

### C. Calon sumber

**C1. Calon disahkan (RSS langsung disahkan hidup, carian web sebenar):**

| Sumber | Bahasa | Kategori | Nota |
|---|---|---|---|
| France 24 English | en | Antarabangsa umum, TIAP-TIAP ITEM ada tag `<category>` (Americas/Middle East/Africa/Europe) | Bukti Tier-1 lebih baik dari BBC/AJ/Guardian sedia ada yang tiada kategori langsung |
| France 24 Arabic | ar | Antarabangsa/Timur Tengah | Suara editorial (penyiar negara Perancis) berbeza dari AJ Arabic/BBC Arabic, kurangkan tumpuan Politics pada AJ |
| DW English | en | Antarabangsa umum, feed per-kategori sebenar wujud (rss.dw.com/xml/rss-en-all, +business/sports/culture/science/environment) | **Disahkan LIVE 2026-08-21** (fetch server-side terus dari mesin Izzat, Status 200, `<title>Deutsche Welle</title>` sah) — sebelum ni gagal dicapai oleh tool audit sahaja, bukan feed sendiri |

**C2. Calon perlu disahkan lagi (URL sebenar wujud, belum disahkan
langsung berfungsi sesi ni):**

| Sumber | Bahasa | Status | Sebab |
|---|---|---|---|
| Al Arabiya | en/ar | Masih 403, sekatan bot sebenar | URL rasmi wujud (dokumentasi MRSS Al Arabiya sendiri), tapi fetch server-side (dgn User-Agent browser sebenar) TETAP 403 — halaman ralat bergaya laman Al Arabiya sendiri (bukan ralat generik), jadi ni sekatan bot yang disasarkan, bukan sekadar User-Agent kosong. Perlu pendekatan lain (headers tambahan/proxy sah) sebelum boleh disahkan |

**C3. Calon ditolak:**

| Sumber | Sebab |
|---|---|
| Reuters | Tiada RSS rasmi yang ditemui/disahkan sejak ~2020; sumber tidak rasmi (proksi pihak ketiga) TIDAK digunakan (per prinsip B) |
| AP (Associated Press) | Sama seperti Reuters — tiada RSS rasmi ditemui/disahkan |
| DW Arabic | Tiada RSS teks rasmi yang sesuai ditemui dalam audit ini |
| NHK World | Tiada RSS teks rasmi yang sesuai ditemui dalam audit ini (kewujudan cuma podcast/audio) |

### D. Simulasi kesan liputan

**en-global** — France 24 English + DW English (lepas sah) boleh angkat
Business/Culture/Environment/Science daripada nipis/kosong ke lebih
sihat, DAN kurangkan tumpuan Guardian pada World. Tapi **Technology,
Education, Religion, Lifestyle, Entertainment MASIH kekal kosong**
selepas kedua-dua sumber ni — jurang ni perlukan **sumber pakar bidang**
(specialist source), BUKAN sumber umum antarabangsa lagi. Sama corak
keputusan ms-MY: Amanz (teknologi), IKIM (agama), KPM (pendidikan) — ni
bukan liputan umum yang boleh diisi BBC/AJ-jenis, ia perlukan portal
khusus bidang tu sendiri.

**ar-global** — France 24 Arabic tambah suara ketiga (kurangkan
tumpuan AJ Arabic pada Politics/Sports/Economy). Al Arabiya (lepas
sah) boleh isi Lifestyle (kosong sekarang) dan tambah Economy.
**Crime, Environment, Education, Entertainment, Religion, World MASIH
tiada calon ditemui langsung dalam audit ni** — sama ada terima kosong
buat masa pelancaran, atau cari sumber ceruk Arab (cth hal-ehwal agama,
sama corak JAKIM/IKIM ms-MY) sebagai kerja susulan berasingan.

### E. Susunan cadangan (untuk 2B putuskan, bukan dikunci di sini)

```
en-global:
1. France 24 English (disahkan)
2. DW English (selepas sah live)
3. Sumber pakar bidang: Technology / Science / Education /
   Religion-Lifestyle (kerja susulan berasingan, bukan skop
   Reuters/AP/DW yang diaudit sesi ni)

ar-global:
1. France 24 Arabic (disahkan)
2. Al Arabiya (selepas sah server-side)
3. Sumber pakar Arab ikut jurang sebenar (Crime/Environment/
   Education/Entertainment/Religion/World — belum ada calon)
```

**Kesediaan pelancaran ar-global TAK bermakna 13/13 kategori mesti ada
berita.** Kategori kosong bukan tanda taxonomy gagal — Culture/
Entertainment baru dipisah (Phase 1B), jumlah sumber Arab masih rendah.
Kategori WAJIB ada bekalan sebelum pelancaran: Politics, Economy,
World, Sports, Culture (+ Religion kalau sumber berkualiti ditemui).
Entertainment/Lifestyle boleh menyusul. Wheel sendiri kena pastikan
tak nampak "rosak" bila kategori kosong (isu UI, kerja berasingan
daripada isu bekalan sumber ni).

**Status: 2A SELESAI, dokumentasi sahaja.** Tiada kod/sumber diubah.
Langkah seterusnya **Global Phase 2B — Source Expansion Decision**
(putuskan: sumber mana masuk, minimum sumber, kategori wajib vs boleh
kosong di pelancaran) — bukan terus wired sumber baharu.

### Nota tambahan — RSSHub disemak, tidak diguna pakai

Izzat cadang semak RSSHub (`github.com/DIYgod/RSSHub`, penjana RSS
sumber terbuka untuk laman tiada RSS rasmi, AGPL-3.0, boleh self-host).
Disahkan: ADA route Reuters — tapi HANYA bahagian "Investigates"
(kewartawanan siasatan), bukan berita am, jadi tak isi jurang liputan
sebenar. ADA route DW dan Al Jazeera juga, tapi DUA-DUA lebihan (DW
sudah ada RSS rasmi sendiri per C2 di atas, AJ sudah wired terus).
**Ditolak sebagai calon**: guna RSSHub untuk Reuters/AP bermakna scrape
laman mereka tanpa kebenaran — bercanggah terus dengan Prinsip B di
atas (mesti feed dikawal/dimiliki sumber sendiri). Reuters sengaja
tutup RSS rasmi mereka; RSSHub cuma cara pintas sekitar keputusan
editorial mereka sendiri, bukan penyelesaian sah.

---

## Global Phase 2B — Source Expansion Decision (2026-08-21)

Keputusan berperingkat ikut struktur ChatGPT. Masih **tiada sumber
diwired fasa ni** — 2B kunci APA yang diluluskan/perlu sah/skop
pelancaran; wiring sebenar ialah Phase 2C (Source Integration Plan).

### A. Prinsip pemilihan akhir

1. **Nilai liputan** — isi kategori kosong, kurangkan dominasi satu sumber.
2. **Kualiti sumber** — stabil, RSS/API rasmi, format konsisten.
3. **Kesesuaian identiti** — en-global/ar-global kekal portal
   antarabangsa, BUKAN terjemahan/"versi Malaysia" (per A2).
4. **Kos penyelenggaraan** — RSS lebih baik dari scraper; elak sumber
   perlukan penjagaan tinggi (sebab tolak RSSHub/proksi pihak ketiga
   di atas).

### B. Keputusan sumber Tier 1

**B1. Masuk fasa pertama (diluluskan)**

| Sumber | Edisi | Status | Sebab |
|---|---|---|---|
| France 24 English | en-global | **Cadangan masuk** | Disahkan hidup; tambah perspektif selain BBC/AJ/Guardian; kurangkan tumpuan Guardian |
| France 24 Arabic | ar-global | **Cadangan masuk** | Disahkan hidup; tambah suara ketiga; kurangkan tumpuan AJ Arabic |
| DW English | en-global | **Cadangan masuk** (disahkan 2026-08-21) | Disahkan LIVE server-side (Status 200); feed per-kategori sebenar (business/sports/culture/science/environment) — isi terus jurang Technology/Science/Culture en-global |

**B2. Perlu pengesahan dahulu (BUKAN "planned source" sehingga lulus)**

| Sumber | Keputusan diperlukan |
|---|---|
| Al Arabiya | Sah kestabilan RSS/akses — 403 BERTERUSAN walau fetch server-side dgn User-Agent browser sebenar (2026-08-21); halaman ralat bergaya laman Al Arabiya sendiri, sekatan bot disasarkan bukan sekadar User-Agent kosong. Perlu pendekatan lain sebelum lulus |
| ~~Global Voices~~ | **DITOLAK** (audit 2026-08-21) — Arab: semua sampel terjemahan En->Ar, bercanggah A2. English: condong opini/advocacy, bukan berita wire-style. Lihat nota audit di bawah |

### Nota audit — Global Voices disemak dan ditolak (2026-08-21)

Izzat cadang globalvoices.org (portal jurnalisme rakyat + rangkaian
terjemahan, kandungan 50+ bahasa termasuk Arab) sebagai calon
diversity-source. Diaudit khusus (BUKAN kriteria sama seperti France
24/DW — ChatGPT tegaskan nilai GV bukan pada jumlah berita tapi
kepelbagaian perspektif) dengan sampel sebenar 12+ item merentas 4 feed
topik EN + feed AR penuh:

- **Arab — diskualifikasi jelas.** SEMUA 8 item disemak
  `ar.globalvoices.org/feed/` ialah terjemahan Inggeris->Arab (byline
  eksplisit "penulis asal (English)... Diterjemah oleh [nama]"). Ni
  model Lingua project GV sendiri (rangkaian penterjemah sukarela),
  bukan newsroom Arab bebas. Bercanggah TERUS dengan prinsip A2 (edisi
  mesti kandungan ASLI). Tiada satu item pun kandungan Arab tulen.
- **English — fit kategori sebenar, tapi kos editorial tinggi.**
  Liputan genap sepadan jurang (Environment/Culture/World/Politics/
  sebahagian Technology), risiko pendua RENDAH (topik negara kecil/
  sudut pandang bawah-atas yang mainstream jarang liput). TAPI
  kebanyakan item bertanda "Feature"/"Weblog" (taksonomi jenis-pos GV
  sendiri) — esei/temu bual/advocacy, BUKAN berita fakta wire-style.
  Perlukan olahan editorial berat sebelum boleh jalan sebagai berita.

**Keputusan**: JANGAN tambah sebagai sumber RSS terus ke mana-mana
edisi dalam bentuk sekarang. Kalau ada minat guna English sahaja masa
depan, perlukan pemilihan manual/kurasi (bukan RSS mentah) dan Arab
KEKAL dikecualikan terus sebab konflik keaslian A2.

### C. Simulasi jurang selepas Tier 1

**en-global selepas France 24 English**: World/Politics kekal sihat
(dua sumber tambahan tak ubah status tu banyak). Business/Culture/
Environment naik taraf sikit (France 24 ada tag kategori per-item).
**Technology/Science/Education/Religion/Lifestyle MASIH kosong** — ni
BUKAN sesuatu satu sumber tambahan lagi boleh selesaikan. Perlu sumber
PAKAR berasingan untuk setiap satu (bukan cari "satu sumber ajaib" yang
isi semua — per D dalam 2A).

**ar-global selepas France 24 Arabic**: World muncul buat pertama kali
(sebelum ni 0). Culture/Entertainment (baru dipisah Phase 1B) mungkin
dapat sedikit tambahan. Economy MASIH bergantung berat pada AJ Arabic
sehingga Al Arabiya disahkan (isi Economy + Lifestyle kalau lulus C2).

### D. Keputusan launch minimum

**en-global — kategori WAJIB ada bekalan sebelum pelancaran:**
```
Minimum:
✓ World
✓ Politics
✓ Business
✓ Culture

Boleh kosong di pelancaran:
Technology, Science, Education, Religion, Lifestyle, Entertainment
```

**ar-global — kategori WAJIB ada bekalan sebelum pelancaran:**
```
Minimum:
✓ Politics
✓ Economy
✓ World
✓ Sports
✓ Culture

Boleh kosong di pelancaran:
Entertainment, Lifestyle, Education, Crime, Environment, Religion
(kecuali sumber ceruk berkualiti ditemui sebelum tarikh pelancaran)
```

Bukan semua kategori mesti penuh sebelum "ready" — per keputusan Phase
1C, kekosongan kategori ialah isu bekalan, bukan kegagalan taxonomy;
Wheel kena elak nampak "rosak" bila kosong (isu UI, kerja berasingan).

### E. Ranking — TAK disentuh fasa ni

Formula kekal Option A (per Phase 1C): calibrated scorer sahaja, tiada
`editorialBoost` global, tiada source-weighting schema. 2B cuma tentang
sumber, bukan ranking.

**Status: 2B SELESAI, dokumentasi sahaja.** Acceptance: senarai sumber
diluluskan (France 24 EN+AR) + senarai perlu sah (DW English, Al
Arabiya) + kategori sasaran setiap sumber + kriteria minimum pelancaran
per edisi — semua direkod di atas. Langkah seterusnya **Global Phase
2C — Source Integration Plan** (macam mana tambah sumber TANPA ganggu
ingestion/classification/production sedia ada — bukan sumber baharu
lagi, tapi PROSES tambah sumber).

---

## Global Phase 2C — Source Integration Plan (2026-08-21)

Reka bentuk PROSES sahaja — **tiada sumber diwired fasa ni.** Tujuan:
elak ulang insiden P0 (sumber masuk → klasifikasi tertinggal → pembaca
nampak kosong, lihat `docs/p0-classification-backlog-incident-v1.md`).

### A. Prinsip integrasi

Sumber baharu MESTI masuk melalui Source Registry (`lab/sources.js` +
`sources` table), bukan terus ke kod classifier/ranking. Sumber MESTI
lalui kitaran PENUH sebelum dianggap "aktif":

```
sources -> ingestion -> classification -> edition_story_classifications
        -> ranking -> reader
```

**Tiada sumber dianggap "aktif" hanya kerana RSS berjaya dibaca** —
RSS boleh dibaca tak semestinya bermakna sumber tu SESUAI (bahasa
betul, kategori sepadan, tiada duplicate berlebihan).

### B. Urutan integrasi sumber baharu

1. **Tambah sumber** — checklist: URL RSS disahkan, bahasa ditetapkan,
   edition target ditetapkan, `source_type` betul, trust/source
   profile disemak (cth France 24 English: `language: en, edition:
   en-global`).
2. **Dry-run ingestion** (sebelum aktif) — periksa jumlah item masuk,
   kadar duplicate, metadata, tarikh penerbitan, bahasa, kategori
   dijangka.
3. **Audit klasifikasi** (selepas masuk) — ukur % berjaya diklasifikasi,
   kategori terhasil, adakah terlalu banyak jatuh ke World (fallback
   generik), adakah `desk-vocabulary.mjs` perlu diperbaiki. **Jangan
   terus tambah keyword hanya kerana satu sumber gagal** — semak punca
   dulu.
4. **Pengesahan pembaca** — Wheel kategori, jumlah berita, susunan,
   **tiada leakage ke edisi lain** (cth France 24 Arabic TAK BOLEH
   tiba-tiba isi ms-MY).

### C. Peraturan rollout — satu sumber setiap kali

Jangan tambah banyak serentak — kalau 5 sumber ditambah sekali gus,
sukar kenal pasti sumber mana MEMBANTU, mana MEROSAKKAN klasifikasi,
mana hasilkan duplicate.

```
en-global: France 24 English -> ukur kesan -> DW English (lepas sah)
           -> sumber pakar kemudian
ar-global: France 24 Arabic -> ukur kesan -> Al Arabiya (lepas sah)
           -> sumber pakar kemudian
```

### D. Source Quality Gate — sebelum sumber jadi kekal

| Pemeriksaan | Wajib lulus |
|---|---|
| RSS stabil | ✓ |
| Tiada duplicate berlebihan | ✓ |
| Klasifikasi boleh diterima | ✓ |
| Kategori sasaran bertambah (bukan static) | ✓ |
| Tiada cross-edition leakage | ✓ |

### E. Selepas integrasi — audit susulan

en-global: Business/Culture cukup? Technology masih kosong?
ar-global: World stabil? Economy tak lagi bergantung satu sumber?
Culture bertambah?

### F. Sengaja TAK dibuat fasa ni

Elak skop berkembang: TIADA source-weighting schema, TIADA AI summary,
TIADA translation layer, TIADA `editorialBoost` global, TIADA manual
ranking global, TIADA scraper (RSSHub-jenis, per nota di atas).

**Status: 2C SELESAI, dokumentasi sahaja.** Acceptance: proses tambah
sumber ditetapkan; France 24 boleh masuk dengan risiko terkawal
(mekanisme dry-run+audit+gate sedia); DW/Al Arabiya kekal lalu
verification gate; tiada perubahan ranking; tiada perubahan taxonomy.

---

## Global Phase 3A — Source Integration Execution: France 24 + DW English (2026-08-21)

**Status: SELESAI, LIVE PRODUCTION.** France 24 English, France 24
Arabic, dan DW English (feed am sahaja) diwired sepenuhnya, disahkan
menambah nilai sebenar, dan sekarang aktif dalam production.

### Ralat reka bentuk ditemui + dibetulkan semasa pelaksanaan

Rancangan asal 2C ("tambah sumber sebagai `disabled` dulu, `--dry-run`
untuk preview selamat, baru aktifkan") **tidak berfungsi seperti
disangka** — `fetchFeed()` (`lab/rss.js:191-192`) sendiri SKIP terus
mana-mana sumber status bukan `active` SEBELUM cuba capaian rangkaian
langsung. Disahkan live: dua `--dry-run` berturutan semasa sumber
`disabled` beri jumlah item mentah SAMA PERSIS (1027) — sumber baharu
tak pernah cuba diambil langsung, bukan diambil-tapi-tak-diguna.
**Keselamatan sebenar `--dry-run` datang daripada sifat "stage tapi
tak pernah swap" ITU SENDIRI, bukan status aktif/tidak-aktif sumber.**
Izzat luluskan pertukaran ke status `active` untuk dapat preview
sebenar — production tetap selamat sepanjang masa sebab `--dry-run`
berhenti sebelum swap tak kira status sumber.

### Hasil audit (Phase 2C Step B3, data staging sebenar)

185 item disumbang 3 sumber baharu: **176 (95.1%) jadi cluster baharu
tersendiri**, cuma **9 (4.9%) diserap sebagai pendua** cerita sedia ada
BBC/AJ/Guardian — kesemua 9 pendua disahkan betul secara semantik
(cerita SAMA, bukan gabungan silap). France 24 Arabic: 23/23 item
(100%) betul ditanda bahasa Arab. **Verdict: liputan genuinely baharu,
bukan sekadar URL tambahan untuk cerita sama** — melepasi Source
Quality Gate (2C bahagian D) dengan jelas.

Nota berasingan (BUKAN penghadang keputusan ni): ~49% cluster yang
disentuh 3 sumber baharu tak diklasifikasi lagi — ChatGPT sahkan ini
tingkah laku classifier SEDIA ADA (bukan disebabkan sumber baharu),
disyorkan jadi tiket audit berasingan ("Global Classification Coverage
Audit v2") supaya isu source-expansion tak bercampur dengan isu
classifier-coverage.

### Pengesahan LIVE production

Ingestion SEBENAR (`node db/ingest-production.js --write`) dijalankan
Izzat, disahkan langsung terhadap DB: `rss_items`=925, `story_clusters`=869,
item sebenar dari `rss-dw-en`/`rss-france24-en`/`rss-france-24-ar`
wujud dalam jadual production (bukan staging).

### Acceptance check (sebelum/selepas, 2026-08-21) — PENUTUP RASMI

**Status: COMPLETE (Teknikal) / CONDITIONAL PASS (Kepelbagaian
Editorial).** Klasifikasi disahkan dah jalan (`edition_story_classifications`
869 baris, `created_at` terkini). 183 cluster jejak balik ke 3 sumber
baharu (160 en-global, 23 ar-global).

**Kesan positif terukur:**

| Kategori | Sebelum | Selepas |
|---|---|---|
| en-global World | 22 item, 2 sumber, Guardian 92% | 45 item, 4 sumber, Guardian 58% |
| en-global Politics | 10 item, 3 sumber | 12 item, 4 sumber |
| en-global Crime | — | naik ke 5 sumber |
| ar-global سياسة Politics | AJ Arabic 86% | AJ Arabic 60%, 3 sumber |
| ar-global رياضة Sports | AJ Arabic 75% | AJ Arabic 56% |

**Tapi belum lengkap sepenuhnya:**
- en-global **Science** (15 item) MASIH 100% satu sumber (DW).
- en-global **Economy** (3 item) MASIH 100% AJ.
- ar-global **Economy** MASIH 100% AJ.
- ar-global **Culture/Technology**: sifar item diklasifikasi lagi.
- Culture/Business en-global "bertambah baik" cuma tukar sumber
  dominan (masih ~80-85% satu sumber).

**Nota bahasa penting (ChatGPT tegaskan)**: statistik dry-run
(176/185, 95.1% cluster baharu) **TAK boleh dianggap keputusan
production final** — log dry-run tak dipersist, tiada rekod
production run untuk sahkan angka sama. Bahasa betul: "Dry-run
menunjukkan potensi tinggi sumber baharu bawa kandungan unik, tapi
kadar tu tak dapat disahkan semula selepas production run sebab
metrik dedup tak disimpan kekal." **JANGAN tulis "95.1% production
value".**

**Sahkan bersih**: SIFAR kebocoran silang-bahasa/edisi (183 cluster
disemak — France 24 Arabic tak bocor ke ms-MY/en-global, sumber
English tak bocor ke ar-global).

**Tiada penghadang pelancaran.** Baki isu (Science/Economy/Culture
monokultur) dipindah ke fasa seterusnya: **bukan lagi "kurang sumber
umum", tapi "kategori tertentu perlukan sumber PAKAR"** (Science →
sumber sains khusus, Economy → sumber ekonomi khusus, sama prinsip
"sumber pakar > banyak sumber umum" yang dah dipersetujui di Phase 2A).

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

## Global Phase 3B — Source Expansion Execution: ScienceDaily + SCMP (2026-08-21)

**Status: PASS (penuh, kedua-dua kategori).** Menutup jurang Science/
Economy monokultur yang Phase 3A punya acceptance check jumpa. Kod tiada
kelulusan per-langkah diperlukan lagi selepas ni (Izzat beri kelulusan
berdiri: "takyah tunggu kelulusan saya kalau benda yg jelas dan
terang") — sumber disahkan hidup, ditambah terus ke production aktif,
ikut proses dry-run+audit yang sama macam 3A.

### ScienceDaily — PASS

**Masalah awal**: 60 artikel ScienceDaily masuk production, **SIFAR
(0) diklasifikasi sebagai Science**. Punca BUKAN sumber gagal —
classifier tak dapat signal kategori sebab tajuk sebenar ScienceDaily
(cth "Schizophrenia's lost brain connections...") tak ada perkataan
literal "science" untuk carian kata kunci (Tier 5) tangkap.

**Tindakan**: tanda `known_category: 'science'` pada sumber (bukti
Tier-1 publisher-declared, `story-understanding.mjs:79-82`) — sama
corak macam feed per-seksyen Harian Metro/Utusan. Dikemas kini di
production (`sources` table + backfill 60 baris `rss_items` sedia
ada), klasifikasi dijalankan semula.

| Metrik | Sebelum | Selepas |
|---|---|---|
| Item Science | 15 | 75 |
| Sumber | 1 (DW) | 2 (DW + ScienceDaily) |
| Sumbangan ScienceDaily | 0 | 60 |

**Monokultur Science BENAR-BENAR hapus** (bukan sekadar dilutkan).

### SCMP Global Economy — PASS

| Metrik | Sebelum | Selepas |
|---|---|---|
| Item Economy | rendah (3) | 44 |
| Sumber | 1 (AJ) | 2 (AJ + SCMP) |
| Dominasi AJ | 100% | 6.8% |
| Sumbangan SCMP | — | 93.2% |

Kandungan SCMP masuk kategori Economy dengan tepat (sampel disahkan,
cth "China and US bond markets head opposite directions").

### Dedup

Kedua-dua sumber: **ScienceDaily 60/60 cluster baharu, SCMP 50/50
cluster baharu** — SIFAR diserap sebagai pendua. Sahkan kandungan
pakar bawa nilai tambah sebenar, bukan pengulangan.

### Pengajaran (untuk fasa expansion akan datang)

**BUKAN** cuma "tambah known_category untuk ScienceDaily" — pengajaran
umum: **sumber khusus dengan kategori editorial sendiri MUNGKIN
perlukan signal kategori publisher-declared (`known_category`).
Classifier berasaskan kandungan sahaja tak semestinya cukup untuk
sumber ceruk (niche).** Kalau tambah sumber pakar baharu masa depan
(cth sumber Economy/Technology tambahan), semak DULU sama ada
`known_category` patut ditetapkan, jangan tunggu acceptance check jumpa
kategori kosong dulu baru sedar.

---

## Nota operasi berasingan — generasi `_old` tertinggal (2026-08-21)

**BUKAN blocker Global Phase 3B, BUKAN sebahagian verdict di atas.**
Larian `--write` pertama Phase 3B gagal (production selamat, Postgres
rollback automatik): generasi `_old` dari swap SEBELUM ni (tak
berkaitan sumber ScienceDaily/SCMP) masih tertinggal, menyekat swap
baharu — dibersihkan dengan proses standard (`snapshot-production.mjs`
-> `drop-ingestion-old-tables.mjs`) sebelum larian kedua berjaya.

**Perkara perlu dikaji berasingan** (bukan sekarang, tiket susulan):
- Kenapa generasi `_old` boleh tertinggal SELEPAS satu ingestion
  berjaya, sedangkan indicator Admin (9D-2) sepatutnya nampak?
- Adakah indicator Admin mencukupi, atau perlu notifikasi lebih agresif?
- Adakah perlu preflight check/reminder SEBELUM ingestion seterusnya
  dijalankan, bukan cuma reaktif bila swap gagal?

Indicator 9D-2 sendiri berfungsi betul (bacaan keadaan semasa, bukan
gagal) — soalan sebenar ialah proses operator, bukan kod indicator.

---

## Nota audit — staleness dokumen lama

Beberapa dokumen 18 Ogos (Fasa 4 edition-rules) tertulis "not yet
implemented, awaiting review" tapi commit HARI SAMA menunjukkan ia siap
dilaksanakan. Sesiapa baca doc lama sahaja (tanpa semak kod/commit sebenar)
akan overstate berapa banyak kerja yang belum siap. Dokumen ni cuba
betulkan staleness tu dengan sengaja rujuk kod sebenar (bukan doc lain)
untuk setiap tuntutan dalam Bahagian A.

---

## Global Phase 4 — Arabic Global Readiness & Classification Hardening (2026-08-21) — DITUTUP

Fasa payung untuk siri 4B/4C di bawah. Verdict keseluruhan (dikunci
ChatGPT selepas dua kaedah audit bebas): **tiada bukti mana-mana kategori
Arab yang disiasat gagal kerana classifier tidak mengenali kandungan yang
tersedia.** Kategori kosong = supply gap tulen, bukan classifier gap.

### 4B-C — Tier 5 geography + vocabulary sebenar (commit 6709b52, b0d6d3d)
- `extractGeographyContentEvidence()` (content-rules.mjs) — geografi
  separuh Tier 5 yang tidak pernah wujud: GEOGRAPHY_VOCABULARY tidak
  pernah disemak terhadap teks tajuk/perihalan, hanya SUBJECT_VOCABULARY.
  Padanan word-boundary Unicode (bukan `.includes()`) — kunci geografi
  pendek ('asia'/'world') tidak boleh false-positive dalam perkataan lain.
- Vocabulary baharu daripada bukti sebenar sahaja: `تكنو` → Technology
  (token kategori France 24), `الأخبار المغاربية` → World (mapping produk,
  bukan fakta geografi — taxonomy 6-region tiada bucket Maghreb, residual
  ar-global menghala semua non-Malaysia ke العالم tanpa mengira label).

### 4B-D — Precedence fix (RULESET_VERSION v1.4.0, commit b0d6d3d)
**"Placement precedence hardening: geography residual fallback no longer
overrides subject-based placement."** Confidence Gate dahulu return awal
ke geografi-residual SEBELUM Tier 3 (Default Placement Mapping) sempat
cuba semua subject candidate — tak kelihatan selagi geography candidate
jarang, tapi Tier 5 baharu (4B-C) mula hasilkan candidate 'Malaysia'
lemah daripada perkataan generik, menurunkan 5 cerita ms-MY sebenar
(Sukan/Politik/Jenayah) ke Nasional generik. Fix: Tier 3 SENTIASA
berjalan dahulu; geografi-residual hanya last resort. Ujian regresi
+ mutation test sebenar: `precedence-fix-regression.test.mjs`.
Disahkan LIVE selepas `--write`: kelima-lima cerita pulih ke kategori
asal via default_mapping.

### 4B-E — Audit kategori kosong ar-global — DITUTUP
Dua kaedah bebas, keputusan sama:
1. Audit metadata/kandungan (71 item ar, word-boundary): Religion/
   Lifestyle/Education/Entertainment/Environment = 0 kandungan tulen.
2. Keyword validation cadangan Izzat (الحج/رمضان/عيد/فتوى/جامعة/مدرسة/
   التعليم dll. terhadap korpus sebenar): 0 padanan tulen — 2 padanan
   `التعليم` disahkan false positive (perkataan generik, bukan berita
   sektor pendidikan).
Culture/Entertainment: kandungan yang wujud (2 item) SUDAH diklasifikasi
betul (ثقافة via default_mapping) — menolak hipotesis "kategori kosong =
classifier rosak". **Keputusan: tiada patch classifier; penambahan
vocabulary tidak dibenarkan tanpa bukti kandungan sebenar.**

### 4C-1 — AITNews (Technology ar-global) — CLOSED PASS
Sumber pakar teknologi Arab (aitnews.com/feed/, Dubai 2005, dipetik Al
Jazeera/Al Arabiya). Didaftar terus dalam registry produksi `sources`:
`rss-aitnews`, language=ar, known_category=technology,
source_type=specialised (corak sama ScienceDaily). Disahkan LIVE:
10/10 item masuk & diklasifikasi تكنولوجيا betul via default_mapping —
ar-global Technology 1 → 10. Corak "sumber pakar > classifier kompleks"
kini terbukti DUA kali (ScienceDaily, AITNews).

**Operational hardening ditemui semasa deployment 4C-1** (commit 8373b4c):
`check_old_generation_exists()` (RPC 9D-2) hanya di-GRANT kepada
`authenticated` — preflight 9D-4 memanggilnya dengan service_role key dan
gagal 42501 pada larian sebenar pertama. `service_role` TIDAK bypass ACL
GRANT/REVOKE fungsi (mekanisme berasingan daripada RLS bypass). Fix:
`GRANT EXECUTE ... TO service_role`
(schema-old-generation-check-rpc-service-role-grant-v1.sql).

### 4C-2 — Religion Source Evaluation — CLOSED DEFERRED
Keputusan strategik, bukan "belum siasat": dinilai calon sebenar
(Dar Al-Ifta Mesir — tiada RSS, format fatwa Q&A bukan berita; MOIA Saudi
— tak boleh diakses; AJ دين — seksyen editorial, bukan feed berasingan;
shuounislamiya/ABNA — risiko neutraliti/mazhab) DAN Izzat sendiri turut
mencari tanpa jumpa calon layak. Kriteria kekal terbuka: feed rasmi +
institusi kredibel + kandungan berita/pengetahuan + tidak bergantung satu
aliran + sesuai pembaca umum. **Lebih baik kategori kosong daripada satu
sumber yang membentuk persepsi keseluruhan edisi.**

### Roadmap dikemas kini (keputusan Izzat, 2026-08-21)
Phase 5 — Reader Experience & UI/UX kini DIREKODKAN sebagai fasa formal
selepas Phase 1-4 (mobile-first jadi titik mula; UX spec; Global Edition
visual/RTL). **Belum dilaksanakan** — arahan eksplisit Izzat: siapkan
Phase 1-4 dahulu, rekod sahaja; satu teguran bukan arahan tukar keutamaan
pelaksanaan. Phase 6 Editorial Intelligence, Phase 7 Advanced features
menyusul selepasnya.

---

## Baseline Fasa 5 — kecacatan pembaca yang SUDAH diukur (2026-08-21)

Direkod semasa semakan sepintas lalu sebelum Fasa 5, atas arahan Izzat
("masukkan dalam pelan"). **Sengaja TIDAK dibaiki** — Fasa 5 belum dibuka.
Diukur pada laman produksi sebenar (bukan anggaran/pembacaan kod semata),
supaya sesiapa yang buka Fasa 5 nanti tidak perlu mencari semula.

### 5-BUG-1 — Tarikh Bahasa Melayu bocor ke SEMUA edisi
`ui/src/components/StoryCard.jsx:7` hardcode
`d.toLocaleString('ms-MY', {...})` tanpa mengambil kira edisi semasa.
Kesan pada pembaca: edisi Inggeris papar "21 **Ogo**, 02:06 **PTG**"
(Ogos/petang), edisi Arab pun sama — bulan dan penanda waktu Melayu dalam
edisi bukan-Melayu. Locale sepatutnya terbit daripada edisi aktif
(`ms-MY` / `en` / `ar`), bukan pemalar.

### 5-BUG-2 — Tajuk berita terpotong separuh ayat (bukan hiasan)
`.story-card__title` ada tinggi tetap + `overflow: hidden`. Diukur live
(`scrollHeight` vs `clientHeight`, bukan agakan):
- Mobile 375px: **10 daripada 10** tajuk terpotong, sehingga **22px**
  tersembunyi (hampir satu baris penuh hilang).
- Desktop 907px: 3 daripada 10 terpotong, 10px setiap satu.
Contoh sebenar: "UK reports unexpected deficit of £1.8bn as John Healey
prepares for…" — baris kedua terkerat di tengah.

**Nota prinsip:** ini betul-betul corak "selesaikan limpahan dengan CSS
clipping" yang ditolak dalam projek adik-beradik (Adjung Brief, CLAUDE.md
peraturan #1: kad tak boleh overflow, dan JANGAN diselesaikan dengan
`overflow-hidden`/`line-clamp` selepas fakta). Pembetulan Fasa 5 patut
melaraskan ruang/saiz supaya tajuk MUAT, bukan menambah `line-clamp` atau
memotong teks editorial.

### Bukan pepijat (disahkan, supaya tidak dilaporkan semula)
- "No stories meeting today's editorial standard yet" pada en-global =
  kategori yang memang kosong (cth Alam Sekitar), bukan kegagalan.
- Tiada limpahan mendatar halaman pada 375px mahupun 907px
  (`scrollWidth === clientWidth` kedua-duanya).
- RTL edisi Arab berfungsi; navigasi wheel kategori berfungsi melalui
  butang anak panah.
