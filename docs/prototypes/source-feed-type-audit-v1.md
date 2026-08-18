# Audit Jenis Feed — Sumber ms-MY Sedia Ada (Loop 5, read-only)

**Status**: Dokumen audit, bukan spesifikasi muktamad. Read-only sepanjang — tiada tulisan ke
`public.sources`, tiada classifier/resolver disentuh.

**Skop & kaedah**: 37 sumber ms-MY (daripada 43 jumlah sumber) disenaraikan daripada
`lab/sources.js`, disahkan SEMUA aktif dalam produksi sebenar dengan cross-reference terhadap
`db/generated/source-operational-baseline.json` (snapshot `public.sources` sebenar,
`capturedAt: 2026-08-16T16:07:40Z`, 43 baris — bukan andaian). Saya tiada kelayakan Supabase
tempatan (`.env` tiada) jadi tak boleh query `public.sources` live terus; guna snapshot sebenar
sedia ada dalam repo sebagai gantinya — dinyatakan dgn jelas, bukan didakwa "live".

Untuk 8 sumber "general" (tiada `knownCategory` dlm fixture) + 1 sumber khusus sbg
spot-check, saya **fetch live** feed sebenar (bukan snapshot/rekaan) dan sampel 10 item
pertama setiap satu. Baki 27 sumber "specialised"/"authority_niche" (ada `knownCategory`,
URL dedikasi satu topik) diklasifikasikan Khusus berdasarkan URL dedikasi sahaja — **TIDAK**
disahkan satu-satu dgn fetch (had masa loop ni) — dinyatakan sbg had di bawah, bukan disembunyikan.

---

## 4 angka ringkasan

| Jenis feed | Bilangan |
|---|---|
| **Feed khusus** (URL dedikasi 1 topik, source-level mapping cukup) | 27 |
| **Feed berstruktur** (pelbagai kandungan, tapi URL/RSS category/title-prefix beri petunjuk berguna) | 4 |
| **Feed campuran** (metadata tak cukup/tak membantu, perlukan content rules) | 4 |
| **Belum pasti** (tak dapat disahkan — akses disekat) | 2 |
| **Jumlah** | **37** |

---

## Matriks penuh

| Sumber | Jenis feed | Metadata membantu? | Content rules diperlukan? | Catatan |
|---|---|---|---|---|
| Metro Mutakhir (`rss-metro`) | Campuran | Tidak (0/20 ada category, disahkan Loop 4) | Ya | Kajian penuh dah siap Loop 4 |
| Berita Harian (`rss-beritaharian`, pressdisplay) | Campuran | **Wujud tapi tak berguna** — category SENTIASA "Muka Depan"/"Nasional" (bukan topik), semua item kongsi satu URL generik `pressdisplay/viewer.aspx`, tajuk berformat `M/D/YYYY: Seksyen: ...` | Ya, TAPI perlu strategi lain daripada Mutakhir — tiada URL unik per-artikel, kena parse tajuk | Sub-jenis campuran BERBEZA drpd Mutakhir |
| Utusan Borneo Sabah (`rss-utusanborneo-sabah`, pressdisplay) | Campuran | Sama corak dgn Berita Harian di atas — "MUKA DEPAN"/"TEMPATAN" sahaja | Ya, corak sama macam Berita Harian | Pressdisplay = 1 sub-jenis kongsi |
| Utusan Borneo Sarawak (`rss-utusanborneo-sarawak`, pressdisplay) | Campuran | Sama corak dgn 2 di atas | Ya, corak sama | Pressdisplay = 1 sub-jenis kongsi |
| Astro Awani (`rss-astro-awani`, general) | Berstruktur | **Ya, via URL** — 0/10 ada `<category>`, TAPI URL setiap item ada segmen desk jelas (`berita-sukan-terkini/`, `berita-malaysia/`, `berita-dunia/`, `hiburan-malaysia/`, `berita-bisnes/`) | Tidak (URL dah cukup) | Disahkan live fetch |
| Bernama Malay (`rss-bernama-bm`, general) | Berstruktur | **Ya, via prefix tajuk** — 0/10 ada `<category>`, TAPI setiap tajuk berformat `"Seksyen : Tajuk"` (cth. "Sukan : Azizulhasni Tunggu...", "Am : Bekas CEO Bank..."). Corak ni dah ada kod sedia ada (`classification/lib/bernama-prefix.mjs`) | Tidak (prefix dah cukup) | Disahkan live fetch |
| Kosmo Digital (`rss-kosmo`, general) | Berstruktur | Ya — 10/10 ada `<category>` bermakna sebenar ("Bola","Sukan","Johor","Selangor","Sukma 2026","Negara") | Tidak | Disahkan live fetch |
| Utusan Malaysia (`rss-utusan`, general) | Berstruktur | Ya — 10/10 ada `<category>` bermakna ("Basikal","SUKAN","OLIMPIK 2028") + URL desk (`/nasional/`,`/luar-negara/`,`/terkini/`) | Tidak | Disahkan live fetch |
| 27 sumber "specialised"/"authority_niche" (Metro Bisnes/Arena/Global/Rap, Utusan Ekonomi/Sukan/Politik/Agama, Kosmo Hiburan, Awani ×7, RTM ×6, IKIM, MOSTI, KPM, Amanz, JHEAIPP) | Khusus | Ya, source-level (URL dedikasi 1 topik) | Tidak | **1 sahaja disahkan live** (`rss-rtm-sukan` — 0/10 category tapi URL ada `sukan/senarai-berita-sukan`, konsisten dgn andaian); baki 26 **TIDAK diverifikasi fetch** loop ni, ikut prior URL dedikasi sahaja |
| JAKIM Berita (`rss-jakim-berita`) | Belum pasti | Tak dapat disahkan | Tak dapat disahkan | **HTTP 403 Forbidden** bila cuba fetch — mungkin sekat bot/user-agent, bukan isu sumber. Perlu disiasat berasingan (mungkin bukan isu "jenis feed" langsung) |
| JAKIM Kenyataan Media (`rss-jakim-kenyataan`) | Belum pasti | Tak dapat disahkan | Tak dapat disahkan | Domain sama dgn di atas (islam.gov.my) — TAK dicuba fetch loop ni, kemungkinan sekatan sama, tak boleh andai |

---

## Dapatan paling penting (di luar jangkaan)

1. **"General/tiada knownCategory" TIDAK bermakna "campuran"** — 4 daripada 8 sumber
   general (Awani, Bernama, Kosmo, Utusan) sebenarnya **berstruktur** apabila disahkan
   fetch sebenar; label fixture `sourceType: 'general'` mengelirukan kalau diambil sbg proksi
   utk "perlukan content rules". Ini sebab audit ni kena fetch sebenar, bukan sekadar baca
   fixture.

2. **Ada 2 SUB-JENIS "campuran" yang berbeza secara struktur**, bukan satu:
   - **Jenis Mutakhir**: URL unik per-artikel, tiada category — mungkin content rule berasaskan
     tajuk/huraian (macam Loop 4).
   - **Jenis Pressdisplay** (Berita Harian, Utusan Borneo ×2): URL **generik dikongsi** semua
     item (`pressdisplay/viewer.aspx?...`), category SENTIASA sama nilai tak bermakna ("Muka
     Depan"/"Nasional"/"Tempatan"), tajuk berformat tarikh+seksyen yg boleh diparse
     (`M/D/YYYY: Seksyen: Tajuk sebenar`). Strategi content rule utk jenis ni MESTI lain
     daripada Mutakhir — mungkin parse seksyen daripada tajuk dulu sebelum content rule
     kata kunci pun releven. **3 daripada 4 sumber campuran ialah jenis pressdisplay ni**,
     bukan jenis Mutakhir — jadi kajian akan datang patut utamakan jenis ni, bukan ulang
     pendekatan Mutakhir semula.

3. **Bernama guna corak prefix tajuk** (`"Seksyen : Tajuk"`) yang projek **sudah** ada kod
   utknya (`classification/lib/bernama-prefix.mjs`) — patut sahkan modul tu memang
   digunakan/disambung utk `rss-bernama-bm` (di luar skop audit ni utk sahkan, sekadar catatan).

4. **JAKIM (2 sumber, 5.4% daripada 37) mungkin ada isu akses**, bukan isu "jenis feed" —
   403 Forbidden konsisten dgn sekatan user-agent/bot, bukan struktur data. Perlu siasatan
   berasingan (di luar skop klasifikasi bidang).

---

## 5 feed campuran paling penting utk dikaji selepas Metro (susunan keutamaan)

Cuma **4** feed campuran wujud dlm 37 sumber ms-MY (bukan 5 — dilaporkan jujur, tak dibulatkan):

1. **Berita Harian** (`rss-beritaharian`) — sumber trust tinggi (95 dlm fixture), 94 item dlm
   feed semasa, jenis pressdisplay. Keutamaan tertinggi sebab volum + trust.
2. **Utusan Borneo Sarawak** (`rss-utusanborneo-sarawak`) — 84 item, jenis pressdisplay sama.
3. **Utusan Borneo Sabah** (`rss-utusanborneo-sabah`) — 36 item, jenis pressdisplay sama.
4. **Metro Mutakhir** (`rss-metro`) — dah dikaji penuh Loop 4, tak perlu ulang.

Cadangan: kaji Berita Harian dahulu (item 1) sbb ia mewakili SEMUA 3 sumber pressdisplay
(struktur sama) — satu kajian mungkin cukup utk maklumkan strategi ketiga-tiganya sekali,
bukan kaji satu-satu berasingan.

---

## Implikasi struktur UI Bidang (utk pertimbangan reka bentuk, bukan keputusan)

Audit ni sokong 3 sub-konsep berbeza di bawah menu "Bidang", bukan satu:

1. **Pemetaan Sumber** — utk 27 sumber Khusus: admin nampak "sumber ini = bidang X" terus,
   tiada JIKA/MAKA diperlukan pun (dah tetap secara struktur URL sumber).
2. **Petunjuk RSS/URL** — utk 4 sumber Berstruktur (Awani/Bernama/Kosmo/Utusan): admin nampak
   peraturan macam "JIKA URL ada X → Bidang Y" ATAU "JIKA prefix tajuk ada X → Bidang Y"
   (Bernama perlukan bentuk borang BERBEZA drpd 3 lain sbb ia prefix-tajuk bukan URL/category).
3. **Klasifikasi Feed Campuran** — utk 4 sumber Campuran, dan di sini sendiri ada 2 sub-bentuk
   (Mutakhir vs Pressdisplay) yg mungkin perlukan UI/logik berlainan.

Ini cadangan berasaskan DATA, bukan andaian — keputusan reka bentuk sebenar tetap milik Izzat.

---

## Had audit ini (jujur)

- 26 daripada 27 sumber Khusus **tidak** disahkan fetch individu — bergantung pada prior
  URL-dedikasi drpd fixture sahaja. 1 spot-check (rtm-sukan) menyokong andaian tapi bukan
  bukti menyeluruh.
- 2 sumber JAKIM tak dapat disahkan langsung (403).
- Sampel 10 item/sumber (bukan feed penuh) — cukup utk corak struktur awal, bukan pengesahan
  100%.
- Tiada percubaan klasifikasi automatik sebenar (`understandStory()`) dijalankan — semua
  pengelasan dibuat manual terhadap XML mentah + kod sedia ada.
