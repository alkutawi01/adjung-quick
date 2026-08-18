# Handoff Semalam — Admin Console V2 (2026-08-19)

**Baca ni dulu.** Semua kerja **local sahaja, TAK push**. 6 commit di atas `7b93632`
(checkpoint terakhir Edition Rules Admin UI). `git log 7b93632..HEAD` utk lihat semua.

## Apa yang berubah malam ini

1. **Audit IA** (`1dc8a0b`) — semak semua UI Admin sedia ada, map kepada 6 fungsi manusia.
2. **Mockup Admin Console V2** (`f299d0e`, `b7225b0`) — HTML statik berasingan (bukan
   `ui/src/admin/` sebenar), shell 6 menu.
3. **Pembetulan ikut kod sebenar** — buang faktor skor & contoh Bidang yang saya reka tanpa
   semak (kata kunci "kerajaan", "RTM→Sukan"); ganti dgn fakta sebenar dari
   `candidate-scoring.mjs`/`desk-vocabulary.mjs`/`content-rules.mjs`.
4. **Kajian Metro Mutakhir** (`abbbd80`) — 20 berita LIVE, 0% ada metadata struktur, rule
   sedia ada "mahkamah" 10% silap kategori dlm sampel ni, cuma 1 calon rule baharu yakin (PRN).
5. **Audit 37 sumber ms-MY** (`a6b3888`, dibetulkan `f001e55`) — lihat angka di bawah.

## Apa Izzat boleh lihat sekarang

- Mockup terkini: buka `docs/prototypes/admin-console-v2-mockup.html` terus di browser
  (tiada server perlu), ATAU link Artifact yang saya hantar sepanjang malam (URL sama,
  auto-kemas kini).
- 6 menu: **Berita** (sub-tab Ringkasan/Semua Berita/Perlu Semakan/Rekod), **Sumber**,
  **Tapisan**, **Bidang**, **Nilai & Susunan**, **Tetapan**.
- **Sudah matang**: struktur nav 6-menu, bahasa JIKA/KECUALI/MAKA (Tapisan), Bidang 2-lapisan
  + borang Data Validation, Nilai & Susunan 3-modul (padan struktur backend sebenar).
- **Masih placeholder**: Tetapan (sengaja ringkas), "Ujian sumber"/RSS health check (backend
  tak wujud), pratonton tapisan (angka ilustrasi, bukan simulasi sebenar).

## Dapatan cukup kuat utk reka bentuk UI

Utk **Bidang**, audit sumber sokong 3 sub-modul:
- **Pemetaan Sumber** — 27 sumber Khusus (URL dedikasi 1 topik).
- **Petunjuk RSS/URL** — 7 sumber Berstruktur (URL desk/RSS category/prefix tajuk bermakna).
- **Feed Campuran** — hanya **1** sumber (Metro Mutakhir), bukan modul utama; keyword ialah
  SATU mekanisme di dalam kes ni, bukan konsep teras seluruh Bidang.

## Dapatan klasifikasi penting

- Metro Mutakhir: metadata struktur hampir tak membantu (0/20 ada category).
- Rule sedia ada berfungsi pada sebahagian item TAPI ada false positive terbukti ("mahkamah"
  tak selamat sbg isyarat mutlak — 2/20 dlm sampel silap kategori).
- 1 calon rule kukuh: **PRN** (lanjutan pola "PRU" sedia ada).
- Jangan tambah kamus besar berasaskan intuisi — "kerajaan" ditolak sbb merentasi 3+ subjek.

## Had audit sumber (PENTING, jangan salah baca)

- **27 diklasifikasikan Khusus** berdasarkan registry/URL/konfigurasi sedia ada; **26
  daripadanya belum diverifikasi fetch individu** malam ni — 1 spot-check (rtm-sukan)
  sokong andaian, bukan bukti menyeluruh.
- **7 Berstruktur** — SEMUA disahkan via fetch LIVE sebenar.
- **1 Campuran** (Metro) — disahkan penuh via fetch LIVE (20 item).
- **2 Belum pasti** (JAKIM ×2) — HTTP 403 bila fetch, bukan diklasifikasi teka.
- **Pembetulan loop 6**: draf awal (v1) silap kira 3 sumber pressdisplay (Berita Harian,
  Utusan Borneo Sabah/Sarawak) sbg Campuran — sebenarnya **Berstruktur**, silap akibat sampel
  10-item-pertama tak wakili feed yg disusun ikut halaman akhbar. Dibetulkan sendiri sebelum
  lapor sbg final — lihat `source-feed-type-audit-v2-correction.md`.
- Beza jelas: **disahkan live** vs **disahkan daripada snapshot production** (baseline
  2026-08-16) vs **inferens daripada konfigurasi** — jangan campur aduk ketiga-tiganya.

## Perkara yang TIDAK disentuh (sengaja)

Tiada schema, tiada RPC, tiada classifier, tiada ranking logic, tiada tulisan ke
`public.sources`, tiada push ke `main`. Satu percubaan tulis fail baharu ke `ui/src/admin/`
disekat oleh sistem keselamatan harness sendiri (autonomous/unattended) — disahkan sbg had
yg wajar, bukan diakali.

## Tugas #1 bersama Izzat (bila dia ada)

**Port mockup Admin Console V2 ke React sebenar di `ui/src/admin/`.** Pelan dah sedia (baca
`AdminApp.jsx` 435 baris dah siap, `fetchAllSourcesForIngestion()` dikenal pasti utk Sumber).
Tak perlu audit semula.

Urutan selepas port: wire Sumber → `public.sources` sebenar → satukan UI Bidang ikut 3 modul
di atas → wire provenance kepada berita perlu semakan → nilai backend gap sebenar → (kemudian
sahaja) kaji Berita Harian sbg wakil keluarga pressdisplay.

## Senarai commit (hash + fungsi)

| Hash | Fungsi |
|---|---|
| `1dc8a0b` | Audit IA Admin Console sedia ada |
| `f299d0e` | Mockup V2 v1 — shell 6 menu |
| `b7225b0` | Mockup V2 v2 — label data jujur, Bidang 2-lapisan, Nilai 3-modul |
| `abbbd80` | Kajian Metro Mutakhir (20 item live) |
| `a6b3888` | Audit 37 sumber ms-MY |
| `f001e55` | **Pembetulan** audit sumber — 3 pressdisplay silap Campuran → Berstruktur |
