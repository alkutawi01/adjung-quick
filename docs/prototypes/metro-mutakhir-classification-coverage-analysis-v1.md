# Kajian Liputan Klasifikasi — RSS Metro Mutakhir (Loop 4, analisis sahaja)

**Status**: Dokumen analisis, BUKAN spesifikasi muktamad. Tiada rule dimasukkan ke
production, tiada classifier/resolver disentuh. Read-only sepanjang kajian ini.

**Sampel**: 20 item SEBENAR, diambil live daripada `https://www.hmetro.com.my/mutakhir.xml`
(feed sebenar rujukan dlm `lab/sources.js` id `rss-metro`) pada sesi ni. Bukan data rekaan/
ilustrasi — setiap tajuk/URL/perenggan dalam dokumen ni disalin terus daripada respons feed
sebenar.

**Soalan produk**: Untuk feed campuran macam Mutakhir, sejauh mana Quick boleh bergantung
pada data yang sumber sudah bagi (URL/kategori RSS/desk), dan pada baki mana kita betul-betul
perlukan content/keyword rules?

---

## Dapatan utama (angka daripada sampel sebenar)

| Kumpulan | Bilangan | % |
|---|---|---|
| **A — struktur/metadata cukup** (URL/kategori RSS/desk tentukan bidang) | 0 | **0%** |
| **B — struktur tak cukup, TAPI content rule (sedia ada/calon kukuh) selesaikan** | 6 | 30% |
| **B (berisiko)** — rule sedia ada termatuh tapi kemungkinan silap (false positive) | 2 | 10% |
| **C — masih ambigu, jangan paksa** | 12 | 60% |

**Dapatan paling penting**: Feed Mutakhir **langsung tiada** tag `<category>` pada
mana-mana daripada 20 item (disahkan dari XML mentah — bukan andaian). URL setiap item pun
sama corak (`/mutakhir/YYYY/MM/id/slug`), tiada segmen desk yang boleh bezakan bidang. Ini
bermakna Lapisan 1 (petunjuk sumber/RSS) **0% berkesan** utk feed ni khusus — bukan sebab
kod tak cukup baik, tapi sebab sumber sendiri (Harian Metro, feed umum) tak bagi isyarat
langsung. Ini sepadan tepat dgn definisi "feed campuran" projek ni.

Kumpulan B (6 item, 30%) diselesaikan oleh peraturan Crime SEDIA ADA
(`mahkamah`/`didakwa`/`ditahan` dari `classification/lib/content-rules.mjs`) yang memang
tepat pada item-item tu (cerita jenayah/mahkamah sebenar). Satu calon rule BAHARU (PRN,
di bawah) turut disahkan.

Kumpulan "B berisiko" (2 item, 10%) ialah dapatan penting berasingan: rule `mahkamah` SEDIA
ADA termatuh pada 2 cerita yang **bukan** cerita jenayah (dasar kerajaan yang sekadar sebut
keputusan mahkamah secara prosedur) — bukti nyata kenapa single-keyword tanpa konteks
berisiko, walaupun pada rule yang dah lama wujud dan dipercayai.

Kumpulan C (12 item, 60%) — majoriti sampel — tiada petunjuk struktur ATAU content-rule
sedia ada yang selamat. Termasuk 3 cerita pendidikan (15% sampel) yang mendedahkan **jurang
struktur**: `content-rules.mjs` langsung tiada senarai frasa untuk subjek Education sama
sekali (PHRASE_RULES hanya ada Crime/Disaster/Politics/Sports/Health/Environment).

---

## Senarai penuh 20 item (eviddensi yang wujud sahaja, tiada rekaan)

| # | Tajuk | Kategori RSS | Kumpulan | Sebab |
|---|---|---|---|---|
| 0 | Bekas CEO bank... dihadapkan ke mahkamah esok | — | B | "mahkamah"/"didakwa"/SPRM sepadan (Crime, betul) |
| 1 | SDAR julang kejuaraan Orkestra Tiupan SBP | — | C | Pendidikan/kebudayaan — tiada frasa sedia ada |
| 2 | Kerajaan tarik balik rayuan... nikotin cecair | — | **B-berisiko** | "mahkamah" (dlm huraian) termatuh, tapi ini cerita dasar kesihatan/pengawalseliaan, bukan jenayah |
| 3 | Dua penguat kuasa KPDN Selangor cedera... Ops Tiris | — | C | Tiada frasa sepadan; 1 contoh sahaja utk cadang rule |
| 4 | Masuk negara orang, patuhi peraturan lalu lintas | — | C | Tiada petunjuk kategori jelas |
| 5 | Malaysia mahu contohi pengurusan sisa Jepun | — | C | Mungkin Alam Sekitar, tapi "sisa"/"kitar semula" bukan frasa sedia ada, 1 contoh sahaja |
| 6 | KPDN KL tumpas sindiket... rampasan RM165,000 | — | C | "sindiket" mungkin calon, tapi 1 contoh sahaja |
| 7 | Lembaga TH perlu miliki kepakaran relevan | — | C | Tadbir urus institusi — ambigu |
| 8 | Negara berpotensi tinggi hadapi El Nino Super | — | C | Mungkin Bencana, tapi "El Nino" bukan frasa sedia ada, 1 contoh sahaja |
| 9 | Isu lesen judi di Kedah... - Sanusi | — | **B-berisiko** | "mahkamah" (Mahkamah Persekutuan, dlm huraian) termatuh, tapi ini cerita politik negeri |
| 10 | Suspek bakar wanita... ditahan polis | — | B | "ditahan" sepadan (Crime, betul) |
| 11 | Bekas CEO 1MDB nafi layan Jho Low... | — | B | "Mahkamah Tinggi" (dlm huraian) sepadan (Crime, betul) |
| 12 | AUKU: Kerangka baharu mesti perkasa autonomi universiti | — | C | Pendidikan — tiada frasa sedia ada |
| 13 | Sempat maklum tugasan selesai sebelum rebah atas stereng lori | — | C | Kisah manusia — tiada kategori jelas |
| 14 | Syarikat alat ganti didenda RM100,000... Mahkamah Sesyen | — | B | "Mahkamah Sesyen" sepadan (Crime, betul) |
| 15 | Polis siasat kehilangan barang kemas wanita | — | C | "Polis siasat" bukan frasa sedia ada (hanya ditahan/didakwa dll), 1 contoh sahaja |
| 16 | MARA bantu Lovely Sabana sambung pengajian di UPSI | — | C | Pendidikan — tiada frasa sedia ada |
| 17 | Lelaki Singapura... ditahan halang tugas polis, merusuh | — | B | "ditahan" sepadan (Crime, betul) |
| 18 | 'Sebagai bapa, saya tidak akan lupakan jasa Koperal Sivaraj...' | — | C | Penghormatan/kisah manusia — tiada kategori jelas |
| 19 | PRN Melaka: Saifuddin Nasution akan bertemu Ab Rauf | — | **B (calon baharu)** | "PRN" (Pilihan Raya Negeri) — lihat cadangan di bawah |

---

## Calon rule yang disyorkan (hanya yang benar-benar berasas)

Selaras arahan: **tidak** dipaksa cukup 5-10 — hanya dilaporkan apa yang sampel ni benar-benar
sokong. 1 calon yakin, 4 calon lemah (perlu sampel lebih besar dulu, BUKAN disyorkan sebagai
rule sekarang).

### Calon YAKIN (1)

**PRN → Politics**
- Pola: `"PRN"` (Pilihan Raya Negeri)
- Contoh sepadan: item #19 ("PRN Melaka: Saifuddin Nasution akan bertemu Ab Rauf")
- Kenapa yakin: `content-rules.mjs` **sudah** ada `"PRU"` (Pilihan Raya Umum) dalam senarai
  Politics — PRN ialah singkatan setara peringkat negeri yang tertinggal daripada senarai yang
  sama. Bukan kata baharu spekulatif, ia lanjutan pola yang projek dah terima.
- Risiko silap: rendah — "PRN" bukan singkatan lazim bagi maksud lain dalam konteks berita ms-MY.
- Selamat sebagai single keyword: **Ya**, sama taraf keselamatan dgn "PRU" sedia ada.

### Calon LEMAH (4) — perlu sampel lebih besar, BUKAN disyorkan sekarang

1. **"sindiket" → Crime** (item #6) — 1 contoh sahaja. Risiko: "sindiket" boleh muncul dlm
   konteks bukan jenayah (cth. laporan ekonomi tentang "sindiket peniaga"). Perlu >=5 contoh
   sebelum dinilai.
2. **"El Nino" → Disaster/Environment** (item #8) — 1 contoh sahaja. Perlu tentukan sama ada
   masuk Bencana atau Alam Sekitar dulu (dua subjek berlainan projek ni).
3. **"pengurusan sisa" / "kitar semula" → Environment** (item #5) — 1 contoh sahaja.
4. **Subjek Pendidikan tiada langsung** — 3 daripada 20 item (15%) ialah cerita pendidikan
   (#1, #12, #16) tapi `content-rules.mjs` tiada satu pun frasa Education. Ini BUKAN cadangan
   kata kunci (belum cukup asas), tapi jurang struktur yang patut dicatat utk keputusan produk
   akan datang: adakah Pendidikan patut jadi subjek content-rule, dan kata apa yang selamat?

## Kata/pola yang DITOLAK (contoh keputusan disiplin, bukan cadangan)

1. **"kerajaan"** — muncul dlm item #2 (kesihatan/dasar), #5 (alam sekitar), #9 (politik
   negeri, dlm huraian "Kerajaan negeri"), #19 (politik, tersirat). Merentasi >=3 subjek
   berbeza dlm sampel 20 item sahaja — DITOLAK sebagai single-keyword, sokong dapatan
   ChatGPT/Izzat malam ni yg dah tolak ni awal-awal.
2. **"mahkamah" sebagai isyarat mutlak** — bukan ditolak (ia rule SEDIA ADA yg produktif pada
   5/20 item), tapi sampel ni buktikan ia bukan 100% selamat: 2/7 (29%) pengesanan "mahkamah"
   dlm sampel ni sebenarnya bukan cerita jenayah. Dicatat sbg risiko sedia ada, bukan cadangan
   pindaan (pindaan rule sedia ada perlukan kelulusan Izzat berasingan).
3. **"sekolah"** — terlalu luas (boleh jenayah-di-sekolah, sukan sekolah, pendidikan, dll),
   tiada asas cukup dlm sampel ni utk cadang walaupun sebagai calon lemah.
4. **"polis"** sebagai kata tunggal — terlalu kerap/generik (muncul konteks jenayah DAN bukan
   jenayah, cth. "polis siasat" boleh utk kehilangan harta remeh atau kes besar).
5. **"Menteri"/nama menteri individu** — sudah ada dlm senarai Politics sedia ada tapi sampel
   ni tunjukkan ia boleh muncul dlm cerita Kesihatan (#2, kementerian relevan) — bukan cadangan
   buang, cuma catatan yg subjek tunggal tak mencukupi tanpa konteks tambahan.

---

## Had kajian ini (jujur)

- Saiz sampel (20 item) **kecil** — cukup utk tunjuk corak awal (terutama 0% Lapisan-1 utk
  feed ni), TAPI tidak cukup utk kunci mana-mana rule baharu selain PRN yg dah disokong pola
  sedia ada.
- Sampel diambil pada SATU masa (bukan rentas beberapa hari) — cerita "breaking"/musim
  tertentu boleh senget pecahan subjek yg nampak.
- Tiada percubaan klasifikasi automatik sebenar dijalankan (tiada panggilan
  `understandStory()`/classifier sebenar) — pengelasan A/B/C di atas dibuat oleh Claude secara
  manual merentasi setiap item, disemak terus terhadap kod `content-rules.mjs`/
  `desk-vocabulary.mjs` sebenar, bukan larian sistem sebenar.

## Cadangan langkah seterusnya (bukan keputusan, sekadar pilihan utk Izzat)

1. Kalau nak, sahkan & tambah `"PRN"` ke senarai Politics dlm `content-rules.mjs` — perubahan
   1 baris, risiko rendah, tapi tetap perlukan kelulusan eksplisit (bukan autonomous).
2. Kalau nak siasat lanjut jurang Pendidikan, jalankan kajian sama pada sampel lebih besar
   (cth. 100+ item merentas beberapa hari) sebelum cadang frasa.
3. Kalau bimbang tentang risiko "mahkamah" 29% false-positive dlm sampel ni, boleh
   pertimbang syarat tambahan (cth. "mahkamah" + "didakwa"/"pertuduhan" serentak) — tapi ini
   keputusan reka bentuk rule sedia ada, bukan sekadar tambah kata baharu.
