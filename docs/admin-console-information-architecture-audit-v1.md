# Audit Seni Bina Maklumat Admin Console — v1

**Skop**: Audit sahaja. Tiada kod diubah. Tiada schema/RPC/resolver/classifier/ranking
disentuh. Baseline: `HEAD 7b93632` ("Fasa 4 Admin UI: edition_rules self-service (ms-MY only)").

**Kaedah**: Baca penuh `ui/src/admin/AdminApp.jsx` (shell + navigasi), kesemua 9 komponen
`.jsx` dalam `ui/src/admin/`, dan adapter/backend yang disentuh setiap satu (`ui/src/admin/*.js`,
`ui/src/adapter/productionAdapter.js`, rujukan silang ke `db/`, `classification/lib/`, `ranking/`,
`state/`).

**Ukuran kejayaan** (ditetapkan oleh arahan): kalau Izzat buka Admin Console, adakah dia nampak
kerja yang dia faham (buat keputusan editorial harian), atau nampak nama-nama modul developer?

---

## 1. Apakah menu Admin sekarang?

Admin Console **tiada URL routing** — satu shell (`AdminApp.jsx`) dengan navigasi berasaskan
React state (`activeSection`), 7 tab. Di atas tab-tab ni ada satu "penukar edisi" (ms-MY / lain)
yang skop sesetengah tab, dan butang log keluar.

| # | Menu semasa | Komponen | Fungsi sebenar | Masalah kefahaman |
|---|---|---|---|---|
| 1 | **Hari Ini** | `AdminDigest` | Ringkasan sehari: berapa berita diproses, berapa perlu perhatian, berapa sumber gagal, senarai perubahan editorial hari ini dalam bahasa biasa. | Rendah — label & kandungan dah dlm Bahasa Melayu mudah faham. |
| 2 | **Semakan** | `ReviewQueueCard` (senarai) | Untuk satu berita ditanda: tukar Bidang, atau sembunyikan — kedua-dua wajib sebab bertulis. | Rendah — bahasa manusia ("Ubah bidang", "Sembunyikan"), tapi **tiada penjelasan kenapa sistem letak berita ni kat sini/bidang ni** (lihat seksyen 4). |
| 3 | **Aliran RSS** | `ClassificationFlow` | Jadual live (auto-refresh) berita RSS terkini + Bidang yang sistem letak, tiada tindakan. | Sederhana — fallback teks `"tiada Bidang (unclassified)"` bocor perkataan status Inggeris mentah ke UI Melayu. |
| 4 | **Keputusan Editorial** | `FilterRulesManager` + 2 kad placeholder ("Pin", "Boost") | Senarai kata dibuang + kekecualian (tapisan kandungan). Pin/Boost belum ada UI (backend dah siap, huraian di bawah). | Sederhana — nama menu "Keputusan Editorial" gabungkan 3 konsep berbeza (tapisan, pin, boost) dalam satu tab, 2 daripada 3 tak berfungsi. |
| 5 | **Peraturan Klasifikasi** | `ClassificationRulesList` | Papar (baca sahaja — sengaja tiada butang tambah/edit) semua peraturan klasifikasi sedia ada: corak → sasaran, keutamaan, status. | **Tinggi** — nama menu ialah nama jadual DB (`classification_rules`), bukan bahasa editor. Dropdown "Kategori" papar kod mentah (`field_code`/`subject_code`) sebagai pilihan, bukan label. Cip keutamaan papar `Priority {n}` dlm Inggeris (bukan "Keutamaan" macam Susunan Edisi). |
| 6 | **Susunan Edisi** | `EditionRulesManager` (ms-MY sahaja; edisi lain papar "Belum tersedia") | Tambah/lihat/arkib/pulih peraturan Admin utk letak semula Bidang tertentu di edisi ni (cth. Politik luar negara → papar bawah Dunia). | **Tinggi** — nama menu ("Susunan Edisi", "Edition Rules") ialah bahasa reka bentuk sistem, bukan soalan yg editor tanya ("Bila mana nak papar kat mana"). Dalaman/copy dah baik (Bahasa Melayu penuh), tapi label menu sendiri tak jelas fungsi. |
| 7 | **Rekod** | `EditorialActivityTimeline` | Log kronologi tindakan editorial (siapa buat apa, bila, sudah tamat tempoh ke tidak). | Rendah — paling bersih dari segi bahasa, tiada kebocoran istilah teknikal. |

**Nota penting — satu keupayaan backend "CLOSED end-to-end" (Fasa 1, Source Registry) LANGSUNG
TIADA menu Admin.** Tiada komponen `.jsx` untuk urus sumber RSS/API wujud dalam `ui/src/admin/`.
Admin boleh nampak kesan sumber (dlm Aliran RSS, Hari Ini) tapi tiada tempat untuk aktifkan/
nyahaktifkan/urus sumber itu sendiri.

---

## 2. Susun semula ikut kerja manusia (hipotesis, bukan keputusan muktamad)

Struktur cadangan 6 menu (daripada arahan) disemak terhadap apa yang **sebenarnya wujud** dalam
kod sekarang:

### A. Pusat Berita
**Tujuan**: Editor lihat berita masuk dan buat keputusan.
**Sedia ada**: `AdminDigest` (Hari Ini) + `ReviewQueueCard`/Semakan — **dua tab berasingan
sekarang**, sepatutnya satu ruang kerja (ringkasan → senarai tindakan, bukan dua klik berlainan).
**Belum ada**: "kenapa sistem buat keputusan ini?" — komponen `ClassificationProvenance.jsx`
**sudah dibina** (corak/keutamaan/kaedah klasifikasi per-berita) tetapi **tidak disambungkan**
ke `ReviewQueueCard` langsung — ini gap paling mudah ditutup sebab kerja dah siap, cuma tak
di-*mount*.

### B. Sumber
**Tujuan**: Urus RSS/API.
**Sedia ada**: **Tiada UI langsung.** Backend (Fasa 1, `public.sources`) CLOSED tapi tiada
komponen Admin. Ini jurang paling besar berbanding hipotesis 6-menu — kalau Izzat nak lumpuhkan
satu sumber berita, tiada tempat buat dalam Admin Console sekarang.

### C. Tapisan
**Tujuan**: Tentukan berita yang tak nak masuk.
**Sedia ada**: `FilterRulesManager` (dalam tab "Keputusan Editorial" sekarang, bukan tab sendiri).
**Belum ada**: `fetchEditorialFilterMatches()` (kesan sebenar tapisan pada berita sebenar) dah
siap di adapter tapi tiada UI — admin boleh edit peraturan tapi tak nampak berita mana yang
kena tapis akibatnya.

### D. Bidang & Kategori
**Tujuan**: Tentukan macam mana berita diklasifikasikan.
**Sedia ada**: `ClassificationRulesList` (baca sahaja) + `EditionRulesManager` (tulis-boleh,
ms-MY sahaja) — **dua tab berasingan** untuk konsep yang berkait rapat (both tentukan Bidang).
**Belum ada**: desk-vocabulary/content-rules (disebut dlm handoff sbg item Admin-controllable
Fasa 4) — tiada UI, tiada storage DB lagi (design-only setakat ni ikut docs).

### E. Nilai & Susunan
**Tujuan**: Tentukan kepentingan & urutan paparan berita.
**Sedia ada**: **Tiada UI.** `candidate-scoring.mjs`, `diversity-selection.mjs`,
`editorial-composition.mjs` semua backend-only. Pin & Boost (dua konsep paling dekat dgn "nilai
& susunan" dari sudut Admin) ada backend penuh (`submitPinOverride`, `submitBoostOverride`,
governance cap) tapi UI cuma kad placeholder "Belum tersedia".

### F. Tetapan
**Tujuan**: sistem umum (log keluar, tukar edisi, dll).
**Sedia ada**: penukar edisi + log keluar wujud di masthead, bukan tab sendiri.
**Rekod** (Rekod aktiviti editorial) — dari struktur 6-menu ni, ia lebih sesuai jadi
sub-bahagian "Pusat Berita" atau "Tetapan" berbanding tab utama sendiri; perlu keputusan Izzat,
bukan andaian saya.

---

## 3. Mapping teknikal

| Modul teknikal | Fail | Model mental Admin | Status |
|---|---|---|---|
| `AdminDigest` + `reviewQueueAdapter.fetchDigest` | `AdminDigest.jsx` | Pusat Berita → ringkasan hari ini | Backend ada, UI ada, bahasa dah baik |
| `ReviewQueueCard` + `reviewQueueAdapter` (hide/reclassify) | `ReviewQueueCard.jsx` | Pusat Berita → tindakan | Backend ada, UI ada, bahasa dah baik |
| `ClassificationProvenance` | `ClassificationProvenance.jsx` | Pusat Berita → "kenapa?" | **Backend+UI komponen ada, TAK di-mount** |
| `classification_rules` (baca) | `ClassificationRulesList.jsx` | Bidang & Kategori | UI ada tapi nama menu & label istilah skema |
| `edition_rules` | `EditionRulesManager.jsx` | Bidang & Kategori (edisi) | UI ada, bahasa baik, nama menu tak jelas |
| `editorial_filter_rules` | `FilterRulesManager.jsx` | Tapisan | UI ada, bahasa baik, tapi terkurung dalam tab lain |
| `fetchEditorialFilterMatches` | `reviewQueueAdapter.js` | Tapisan → kesan sebenar | **Backend ada, UI TIADA** |
| `story_overrides` (log) | `EditorialActivityTimeline.jsx` | Rekod | UI ada, bahasa paling bersih |
| Source Registry (`public.sources`) | *(tiada fail admin)* | Sumber | **Backend CLOSED, UI TIADA LANGSUNG** |
| `submitPinOverride` / `submitBoostOverride` | `reviewQueueAdapter.js` | Nilai & Susunan | Backend ada + diuji, UI kad placeholder sahaja |
| `candidate-scoring.mjs` / `diversity-selection.mjs` / `editorial-composition.mjs` | `ranking/` | Nilai & Susunan | Backend ada (CLI/skrip), UI TIADA, dasar human-readable belum dimuktamadkan (per handoff) |
| desk-vocabulary / content-rules Admin override | `classification/lib/` | Bidang & Kategori | Design-only, storage belum dibina (per docs Fasa 4) |
| `editorialAttentionAdapter`/`Config` (Attention V2) | `ui/src/admin/editorialAttentionAdapter.js` | Pusat Berita → gabungan "perlu perhatian" | **Backend ada (dibina sengaja sbg pengganti masa depan utk Hari Ini + Semakan gabungan), sengaja belum disambung — per komen fail sendiri** |
| `explainability-report.mjs` | `ranking/` | Pusat Berita / Nilai & Susunan → "kenapa berita ni masuk, itu tidak" | Backend prototaip CLI, UI TIADA |
| `classification-observatory.mjs` | `db/` | Bidang & Kategori → diagnostik | Skrip CLI sahaja, UI TIADA |

---

## 4. Perubahan UI yang paling memberi kesan

**Tinggi** (nampak segera, kos rendah, guna backend sedia ada):
- Sambungkan `ClassificationProvenance.jsx` ke `ReviewQueueCard` — komponen dah siap dibina,
  cuma tak di-*mount*. Ini terus jawab "kenapa sistem buat keputusan ini?" yang jadi punca
  jurang utama menurut audit.
- Tukar nama menu teknikal kepada bahasa editor: "Peraturan Klasifikasi" → sesuatu macam
  "Bagaimana sistem kenal Bidang", "Susunan Edisi" → soalan yg dijawab (cth "Bila papar di
  edisi lain"). Tak perlu ubah komponen, cuma label string.
- Baiki kebocoran istilah dalam `ClassificationFlow` (`"tiada Bidang (unclassified)"`) dan
  `ClassificationRulesList` (`Priority {n}` → "Keutamaan {n}", dropdown kategori guna label
  bukan kod mentah) — string sahaja, tiada logik berubah.

**Sederhana**:
- Gabungkan "Hari Ini" + "Semakan" secara visual/navigasi sbg satu ruang kerja "Pusat Berita"
  (boleh kekal 2 komponen React, cuma disusun semula dlm satu tab/seksyen).
- Pisahkan "Keputusan Editorial" (skrg gabung Tapisan+Pin+Boost dlm 1 tab) kepada tab "Tapisan"
  sendiri, dan biar Pin/Boost kekal placeholder jelas berlabel "akan datang" sehingga backend
  disambung.
- Tambah penerangan ringkas (1 ayat) pada setiap seksyen: "Apa yang saya boleh buat di sini?"

**Rendah**:
- Kemasan visual/spacing.
- Urutan tab (tak berubah kesan faham, cuma keselesaan).

---

## 5. Apa yang TIDAK dicadangkan dalam audit ini

Selaras arahan — audit ini sengaja **tidak** cadangkan:
- ❌ Jadual (table) DB baharu
- ❌ Migration
- ❌ RPC baharu
- ❌ Ubah logik classifier
- ❌ Ubah logik ranking

Semua cadangan seksyen 4 boleh dilaksanakan guna fungsi backend **sedia ada** — penyusunan
semula navigasi, tukar label/string, dan sambungkan (mount) komponen yang dah siap dibina tapi
tak digunakan. Tiada satu pun perlukan perubahan schema/resolver/RPC.

---

## Jurang paling ketara (ringkasan untuk semakan Izzat)

1. **Sumber (Source Registry) tiada UI Admin langsung** — walaupun backend CLOSED sejak Fasa 1.
2. **`ClassificationProvenance` dibina tapi tak disambungkan** — "kenapa sistem buat keputusan
   ini" (soalan teras yang ChatGPT kenal pasti sebagai jurang utama) ada penyelesaian separuh
   siap yang belum di-*mount*.
3. **Pin & Boost** — backend+ujian penuh, UI cuma placeholder "Belum tersedia".
4. **Nilai & Susunan (scoring/ranking)** tiada UI Admin sama sekali, dan dasar human-readable
   belum dimuktamadkan di peringkat produk (bukan sekadar UI) — ini perlu keputusan Izzat dulu
   sebelum apa-apa UI dibina, bukan cuma kerja penyusunan semula.
