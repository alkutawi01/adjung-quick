# PEMBETULAN — Audit Jenis Feed Sumber (v1 → v2)

**Baca dokumen ni SEBELUM `source-feed-type-audit-v1.md`.** v1 tersilap klasifikasikan 3
sumber sebagai "Campuran" akibat bias saiz sampel. Dokumen ni jelaskan silap tu, betulkan
angka, dan catat pengajaran kaedah supaya tak berulang.

## Apa yang silap

v1 sampel **10 item pertama sahaja** setiap feed pressdisplay (Berita Harian, Utusan Borneo
Sabah/Sarawak) dan simpulkan category "SENTIASA sama nilai tak bermakna (Muka Depan/
Nasional)". Selepas saya parse **SELURUH** feed (bukan cuma 10 pertama), keputusan berbeza
total:

| Sumber | Kategori dlm 10 item pertama (v1) | Kategori SEBENAR merentas seluruh feed (v2) |
|---|---|---|
| Berita Harian | Muka Depan, Nasional sahaja | **14 kategori**: + Komentar, Rencana, Bisnes, Bahasa Melayu, Bahasa Inggeris, Matematik Bahagian A, Sains, Jawapan, Wanita&keluarga, Dunia, Hip, Sukan |
| Utusan Borneo Sabah | (tak disemak berasingan dlm v1) | 5 kategori: Muka Depan, Tempatan, Nasional, Sukan, Iklaneka |
| Utusan Borneo Sarawak | (tak disemak berasingan dlm v1) | 7 kategori: Muka Depan, Tempatan, Rencana, Nasional, Dunia, Berita Iban, Sukan |

**Punca**: Feed pressdisplay ni ialah digitalisasi akhbar cetak, disusun IKUT SUSUNAN
HALAMAN sebenar (muka depan dulu, nasional, baru bisnes/sukan/dll di kemudian). Sampel "10
item pertama" utk feed jenis ni sistematik bias ke arah seksyen AWAL sahaja — bukan sampel
rawak yg wakili keseluruhan edisi. Ini **BUKAN** sama dgn Metro Mutakhir (yg sistematik tiada
category langsung, tak kira berapa banyak disampel).

## Pembetulan klasifikasi

| Sumber | Klasifikasi v1 (SILAP) | Klasifikasi v2 (BETUL) | Sebab |
|---|---|---|---|
| Berita Harian | Campuran | **Berstruktur** | Category asli ADA makna sebenar bila lihat seluruh edisi (Bisnes/Sains/Dunia/Sukan/dll betul-betul beza topik) |
| Utusan Borneo Sabah | Campuran | **Berstruktur** | Sama — SUKAN/TEMPATAN/NASIONAL wujud sbg kategori berasingan |
| Utusan Borneo Sarawak | Campuran | **Berstruktur** | Sama — Dunia/Sukan/Berita Iban wujud sbg kategori berasingan |
| Metro Mutakhir | Campuran | Campuran (tidak berubah) | Disahkan 0/20 category — bukan isu bias sampel, feed ni memang tiada category langsung |

**Nota penting satu lagi**: Berita Harian ada kategori pelik yg BUKAN berita — "Bahasa Melayu",
"Bahasa Inggeris", "Matematik Bahagian A", "Sains" (dlm konteks ni), "Jawapan" rupanya
**kandungan latihan/soalan peperiksaan sekolah** (pull-out akhbar utk pelajar), bukan artikel
berita sama sekali. Cth item #57: "Rajah 1 menunjukkan wang yang dimiliki oleh Aiman..." —
soalan matematik, bukan berita. Ini isu BERBEZA drpd klasifikasi Bidang — ia soalan "patut ke
item ni masuk Quick langsung" (tapisan/exclusion), bukan "bidang apa item ni". Dicatat sbg
dapatan berasingan, bukan diselesaikan di sini.

## 4 angka DIPERBETULKAN

| Jenis feed | v1 (silap) | v2 (betul) |
|---|---|---|
| Feed khusus | 27 | 27 (tak berubah) |
| Feed berstruktur | 4 | **7** (+3: Berita Harian, Utusan Borneo Sabah, Utusan Borneo Sarawak) |
| Feed campuran | 4 | **1** (-3: hanya Metro Mutakhir kekal) |
| Belum pasti | 2 | 2 (tak berubah) |
| **Jumlah** | 37 | 37 |

**Kesan besar**: Sebelum ni saya laporkan "3/4 sumber campuran ialah jenis pressdisplay" dan
cadangkan Berita Harian sbg keutamaan kajian seterusnya. Itu SILAP — hanya **1 daripada 37**
sumber ms-MY (Metro Mutakhir sahaja) benar-benar Campuran ikut definisi audit ni. Tiada feed
campuran lain yg berbaki utk dikaji dlm senarai sumber sedia ada.

## Pengajaran kaedah (utk kajian akan datang)

**Jangan sampel "N item pertama" utk feed yg disusun ikut struktur (edisi/halaman/seksyen).**
Untuk feed jenis tu, sama ada:
- sampel SELURUH feed (macam yg saya buat utk pembetulan ni — 94/36/84 item, bukan besar
  sangat pun utk feed harian biasa), atau
- sampel RAWAK merentas feed, bukan N-pertama.

Metro Mutakhir selamat disampel "10 pertama" sebab ia feed masa-nyata (bukan tersusun ikut
seksyen tetap) — kaedah sampel yg betul bergantung pada JENIS penyusunan feed, bukan satu
kaedah sama utk semua.

## Implikasi UI Bidang (dikemas kini)

Dgn hanya 1 sumber benar-benar Campuran, sub-konsep "Klasifikasi Feed Campuran" dlm cadangan
UI asal (v1) kekal relevan tapi skop lebih kecil drpd disangka — ia utk Metro Mutakhir SAHAJA
buat masa ini, bukan 4 sumber. "Petunjuk RSS/URL" (Berstruktur) kini meliputi 7 sumber, bukan
4 — termasuk keperluan borang KHAS utk pressdisplay (category asal tapi perlu penapisan
kandungan bukan-berita dulu).

---

*Dokumen v1 (`source-feed-type-audit-v1.md`) dikekalkan tanpa diedit sbg rekod audit trail
sejarah (apa yg dilaporkan pada masa tu) — pembetulan ni dokumen BERASINGAN, bukan gantian
senyap, supaya jelas apa yg silap dan bila dibetulkan.*
