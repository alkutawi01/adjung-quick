<!-- Polish 8E-A audit. Read-only; no code changed. Produced 2026-08-20 by a
     5-dimension parallel audit with an adversarial verification pass over each
     load-bearing claim (37 agents, 0 errors). K1 and K2 were additionally
     re-verified by hand before being reported to the director. -->
# Laporan Audit 8E-A — Penempatan Berita (Adjung Quick)

Audit baca-sahaja ke atas `C:/Users/alkut/Downloads/adjung-quick`. Semua nombor baris disahkan terhadap sumber.

---

## PENEMUAN KRITIKAL

### K1 — Rule yang disimpan admin TIDAK memberi apa-apa kesan kepada pembaca sehingga seseorang menjalankan skrip CLI secara manual, dan UI tidak pernah memberitahunya

Penempatan memang sampai kepada pembaca — tetapi hanya melalui jadual yang dikira lebih awal, bukan dinilai semasa baca:

- `edition_rules` dibaca oleh satu tempat sahaja: `db/classify-production.js:89-94` (`.from('edition_rules')…eq('status','active')`), dihantar ke pengelas di `:136-142`.
- Hasilnya ditulis sebagai `field_code` ke `edition_story_classifications` (`db/classify-production.js:171`, upsert `:222-223`).
- Pembaca membaca jadual tersimpan itu sahaja (`ui/src/adapter/productionAdapter.js:50-52`), menjadikannya `topic` (`:199`), yang ditapis di `state/reducer.js:145` dan dirender di `ui/src/components/ActiveSetList.jsx:34`.
- Skrip itu CLI manual: `db/classify-production.js:41` (`process.argv.includes('--write')`), dipagar kepada panggilan langsung di `:236`. Tiada cron dalam `vercel.json`, tiada direktori `.github/`, tiada skrip dalam `package.json:7-23`. Tambahan pula `db/production-write-guard.mjs:18-39` menuntut `DATABASE_ENV` dan `CONFIRM_PRODUCTION_WRITE=true`.
- Selepas rule disimpan, pengendali hanya memuat semula senarai rule: `ui/src/admin/AdminApp.jsx:253-263`. Tiada notis pada `ui/src/admin/EditionRulesManager.jsx:44-47` mahupun `ui/src/admin/BidangPanel.jsx:884-886`. Bandingkan `ui/src/admin/SourceRegistryPanel.jsx:141`, yang memang memberi amaran kesan tertangguh.
- Apabila skrip dijalankan, ia memadam dan menjana semula seluruh jadual (`db/classify-production.js:212`), jadi kesannya retroaktif kepada semua kelompok aktif, bukan hanya berita baharu.

### K2 — Dua rule admin berkeutamaan sama menyebabkan KEDUA-DUANYA dibuang; override admin kalah kepada tetapan asas secara senyap

- `classification/lib/edition-rules-resolver.mjs:36` — `return tied.length === 1 ? tied[0] : null;`. Nilai `null` menyebabkan `classification/edition-classification.mjs:98` gagal dan `:118` (registry built-in) dijalankan.
- Keutamaan diberi automatik sebagai kiraan rule aktif: `ui/src/admin/EditionRulesManager.jsx:78` (`nextPriority={activeRules.length + 1}`) dengan penapis `:33`. Arkibkan satu rule, kiraan turun, rule berikutnya mewarisi nombor yang masih dipakai.
- `restore_edition_rule` mengaktifkan semula tanpa menomborkan semula keutamaan: `db/schema-edition-rules-rpc-authenticated-patch-v2-hotfix.sql:120`.
- Tiada UNIQUE pada keutamaan: `db/schema-edition-rules-v1.sql:70`; satu-satunya index (`:100`) bukan unik. RPC tidak menyemak keutamaan langsung (hotfix `:44-83`).
- Nombor keutamaan sengaja disembunyikan daripada editor (`ui/src/admin/EditionRulesManager.jsx:142-147`), jadi editor tidak dapat melihat atau membetulkan perlanggaran itu.
- Perlanggaran hanya merosakkan apabila kedua-dua rule sepadan dengan berita yang SAMA (penapis `matchesRule` berjalan dahulu, `edition-rules-resolver.mjs:54-55`).
- Tingkah laku "tolak apabila seri" itu sendiri disengajakan dan sudah diuji (`classification/edition-rules-resolver.test.mjs:99-108`). Yang cacat ialah cara UI memberi nombor, bukan semantik penyelesai.

### K3 — Wiring `edition_rules` dalam `classify-production.js` langsung tiada liputan ujian (risiko, bukan kerosakan)

`db/classify-production-wiring.test.mjs:57`, `:70`, `:80` semuanya memanggil `classifyForAllEditions` dengan EMPAT argumen, sedangkan parameter edition rules ialah yang KELIMA (`classification/edition-classification.mjs:263`). Jika baris `db/classify-production.js:89-94`/`136-142` tercicir suatu hari, tiada ujian akan menangkapnya.

---

## 1. Bentuk data sebenar rule sekarang

Ada DUA bentuk berbeza, sengaja tidak disatukan.

**(a) Rule admin — jadual Postgres `edition_rules`, baris RATA 12 lajur** (`db/schema-edition-rules-v1.sql:39-96`):

| Lajur | Baris | Nota |
|---|---|---|
| `id` UUID PK | `:40` | UUID dijana, bukan slug |
| `edition_id` TEXT NOT NULL | `:44` | sentiasa satu edisi; tiada kes NULL/global |
| `condition_subject` TEXT NOT NULL | `:53` | dipadan sama-tepat dengan `subject_candidates[0].value` (`edition-rules-resolver.mjs:20`, `:51`) |
| `condition_geography_type` TEXT CHECK IN ('not','is') | `:60` | |
| `condition_geography_value` TEXT | `:61` | tiada CHECK domain, tiada FK |
| `action_field_code` TEXT NOT NULL | `:67` | `field_code` stabil, bukan label (`:65-66`) |
| `priority` INTEGER NOT NULL DEFAULT 0 | `:70` | nombor lebih TINGGI menang (`edition-rules-resolver.mjs:33`) |
| `status` TEXT CHECK IN ('active','archived') | `:72` | tiada keadaan 'draft'/'disabled' |
| `created_by`/`created_at`/`updated_at`/`reason` | `:74-83` | `reason` wajib hanya semasa arkib (`db/schema-edition-rules-rpc-v1.sql:97-99`) |

Kekangan: `edition_rules_geography_xor` (`:87-90` — jenis dan nilai kedua-duanya NULL atau kedua-duanya terisi) dan `edition_rules_field_fk` pada `(edition_id, action_field_code)` → `taxonomy_fields` (`:94-95`, sasaran UNIQUE di `db/schema-taxonomy-fields-v1.sql:41`). Satu index `(edition_id,status)` (`:100`), RLS aktif (`:106`), SELECT kepada `authenticated` sahaja (`:111`).

**(b) Rule built-in — objek JS hardcode, bentuk BERSARANG** (`classification/lib/edition-rules.mjs:15-26`): `{rule_id, priority, condition:{subject, geographyNot|geographyIs}, action:{display_field}}`. Hanya SATU rule wujud (`foreign_politics_to_world`, ms-MY); `'en-global'` dan `'ar-global'` array kosong (`:24-25`).

**Empat perbezaan struktur yang penting**
- Built-in menyimpan LABEL `'Dunia'`, rule admin menyimpan KOD `'dunia'`; penukaran berjalan arah bertentangan (`edition-classification.mjs:122-123` lawan `edition-rules-resolver.mjs:58-63`).
- Arah keutamaan TERBALIK: built-in isih menaik, nombor rendah menang (`edition-rules.mjs:33`); admin isih menurun (`edition-rules-resolver.mjs:33`).
- `rule_id`: slug manusia lawan UUID, kedua-duanya masuk lajur TEXT `classification_rule` yang sama (`edition-classification.mjs:131` lawan `:107`; `db/schema-edition-classification.sql:53`). `classification_method` kekal `'edition_rule'` pada kedua-dua laluan (`:106`, `:130`).
- Built-in tiada `status`/`reason`/`created_by` — tidak boleh diarkib, hanya boleh dilindung; UI memaparkannya sebagai rentetan diselenggara tangan (`ui/src/admin/EditionRulesManager.jsx:30`, komen `:22-24`).

**Jurang data yang disahkan**
- **Tiada whitelist DB** untuk `condition_subject` mahupun `condition_geography_value`. RPC hanya menyemak bukan-kosong dan enum jenis (`db/schema-edition-rules-rpc-v1.sql:43-45`, `:51-53`; sama pada hotfix `:53-55`, `:61-63`). Satu-satunya whitelist ialah dropdown klien (`EditionRulesManager.jsx:15-16`), yang boleh dipintas kerana RPC diberi EXECUTE kepada `authenticated` (`db/schema-edition-rules-rpc-authenticated-patch-v1.sql:146`). Komen `db/schema-edition-rules-v1.sql:50-52` mendakwa `condition_subject` "validated at the RPC layer" — dakwaan itu TIDAK benar. `condition_geography_value` memang tersentuh satu CHECK peringkat jadual (XOR, `:87-90`), tetapi itu semakan berpasangan NULL, bukan had domain; lajur adiknya `condition_geography_type` pula memang ada CHECK domain (`:60`).
- **Tiada UNIQUE pada kandungan rule** — dua rule serupa boleh wujud serentak (skema `:39-96` tiada UNIQUE; RPC INSERT tanpa semakan kewujudan, `db/schema-edition-rules-rpc-v1.sql:70-77`).
- **FK tidak mengambil kira `taxonomy_fields.status`**, sedangkan registry runtime hanya memuat `status='active'` (`classification/lib/taxonomy-registry.mjs:115-119`). Rule aktif yang menyasarkan bidang diarkib akan senyap tidak menyala (`edition-rules-resolver.mjs:58-59`) sementara UI masih menyenaraikannya sebagai aktif (`EditionRulesManager.jsx:33`). Setakat ini tiada panel taxonomy dalam `ui/src/admin`, jadi pengarkiban hanya boleh berlaku melalui `db/taxonomy-fields-adapter.mjs:43,53` atau SQL terus.
- **'Disaster' tidak boleh dijadikan syarat rule** walaupun pengelas boleh menjananya (`classification/lib/content-rules.mjs:35`) dan ia mempunyai taxonomy field dalam ketiga-tiga edisi (`taxonomy-registry.mjs:62,79,96`) — ia tiada dalam `SUBJECT_VOCABULARY` (`classification/lib/desk-vocabulary.mjs:17-63`) yang memberi makan dropdown.
- Padanan hanya menggunakan calon TERATAS (`edition-rules-resolver.mjs:51-52`), dan `'not'` menuntut geografi WUJUD (`:21`) — "luar Malaysia" bermaksud "geografi dikesan dan bukan Malaysia", bukan "tidak diketahui Malaysia".

---

## 2. Bahagian UI yang tidak sepadan dengan mental model sasaran

Laluan halaman: `ui/src/admin/adminRouter.js:31` (`/admin/kategori/penempatan`, label "Penempatan Berita") → `AdminApp.jsx:443-444` → `BidangPanel.jsx:894` → `EditionRulesManager.jsx`. Borang hanya dipaparkan untuk ms-MY (`BidangPanel.jsx:887`); edisi lain mendapat kad placeholder (`:906-913`).

**Rentetan yang melanggar**
- **"seksyen"** — dua tempat: label medan `EditionRulesManager.jsx:204` ("paparkan dalam seksyen:") dan placeholder `:206` ("— Pilih seksyen —"). Perkataan ini tidak muncul di mana-mana lagi dalam `ui/src`; konsep yang sama dinamakan "kategori" di `BidangPanel.jsx:64`, `:114` dan `EditionRulesManager.jsx:179`, manakala kumpulan navigasi dilabel "Kategori" (`adminRouter.js:13`). Ini ketidakselarasan istilah, bukan sekadar pengulangan.
- **"bidang"** — `EditionRulesManager.jsx:177` ("Jika bidang:") melanggar kunci istilah yang memang didokumenkan dalam repo (`docs/backend-control-plane-implementation-plan-v1.md:12-15`: teks admin/pembaca guna "Kategori", bukan "Bidang"), sedangkan placeholder tepat di bawahnya (`:179`) sudah menyebut "kategori".
- **Dua tajuk bertindih** — h2 "Penempatan Berita" (`AdminShell.jsx:84`, label daripada `adminRouter.js:31`) dan h3 "Paparan Edisi — Malaysia · Malay Edition" (`EditionRulesManager.jsx:43` + `state/editions.js:26`), dipisahkan satu perenggan (`BidangPanel.jsx:884-886`). Untuk edisi bukan ms-MY, h3 itu pula ialah "Penempatan Berita" (`BidangPanel.jsx:908`) — rentetan sama dipapar dua kali.
- **Salinan huraian tidak sepadan** — yang ada ialah `BidangPanel.jsx:884-886` dan `EditionRulesManager.jsx:44-47`. Ayat sasaran ("Tentukan jika berita daripada sesuatu kategori perlu dipaparkan dalam kategori lain.") tidak wujud di mana-mana dalam repo.
- **Nilai Inggeris mentah bocor ke UI Melayu**:
  - dropdown subjek terikat kepada nilai Universal Subject Inggeris (`EditionRulesManager.jsx:15`, `:180`; `desk-vocabulary.mjs:17-63`) — "Politics", bukan "Politik";
  - dropdown geografi sama (`:16`, `:198`; `desk-vocabulary.mjs:67-75`) — Americas, Europe, Malaysia, Middle East, Southeast Asia, World;
  - baris rule mencetak nilai tersimpan mentah (`:96-98`) → "Politics, bukan dari Malaysia → Dunia";
  - hanya dropdown ketiga terikat kepada taksonomi edisi/label Melayu (`:207-209`).
- **Mesej ralat pembangun mentah dipaparkan kepada admin** — `editionRulesAdapter.js:16` (`fetchEditionRules: ${error.message}`) dirender apa adanya di `BidangPanel.jsx:889`; sama untuk `addEditionRule` (`:30`), `archiveEditionRule` (`:36`), `restoreEditionRule` (`:41`).
- **Gaya bahasa** — "awak" (`EditionRulesManager.jsx:45`) dan "opsyenal" (`:185`).

**Yang sudah SEPADAN**
- Keempat-empat medan rule ialah `<select>` (`EditionRulesManager.jsx:178`, `:186`, `:196`, `:205`); satu-satunya input teks bebas ialah kotak sebab arkib (`:120-127`).
- Istilah backend (`condition_subject`, `geography_type`, `action_field_code`, `priority`) tidak pernah dicetak sebagai teks — ia hanya pengecam JS dan senarai lajur `.select()` (`editionRulesAdapter.js:13`).
- Nombor keutamaan tidak dipapar/dimasukkan (`EditionRulesManager.jsx:78`, `:164`, komen `:142-147`). Kelas CSS mati `.edition-rules__priority` masih tinggal (`ui/src/style.css:932`).

**Bentuk sasaran yang belum wujud**
- **Tiada jadual langsung** — rule dirender sebagai baris flex (`EditionRulesManager.jsx:95-101`; `ui/src/style.css:914-921`), jadi lajur "Berita | Lokasi | Paparkan dalam" tiada padanan.
- **"Jika lokasinya [Luar Malaysia]" kini DUA kawalan** — dropdown jenis (`:184-191`) dan dropdown nilai yang hanya muncul selepas jenis dipilih (`:193-201`). "Luar Malaysia" hanya boleh dinyatakan sebagai gabungan `type='not'` + `value='Malaysia'`.
- `ui/src/admin/copyLint.test.mjs:27-31` tidak mengenali mana-mana istilah ini, dan tiada ujian menegaskan salinan halaman ini — jadi menukar rentetan tidak memecahkan sebarang ujian.

---

## 3. Boleh diwakili tanpa migration? **YA**

- Ketiga-tiga bahagian rule sudah mempunyai lajur: `condition_subject` (`db/schema-edition-rules-v1.sql:53`), `condition_geography_type`/`_value` (`:60-61`), `action_field_code` (`:67`).
- Penyelesai sudah melaksanakan tepat `subject == X AND geography != Y -> field Z` (`classification/lib/edition-rules-resolver.mjs:19-24`).
- Ujian penerimaan sedia ada sudah membina baris dengan bentuk syarat yang SAMA dan menegaskan ia menyala: `classification/edition-rules-resolver.test.mjs:46` (`condition_subject:'Politics'`, `type:'not'`, `value:'Malaysia'`).
- Nilai tersedia tanpa perubahan kod: `'Politics'` (`desk-vocabulary.mjs:19` → dropdown `EditionRulesManager.jsx:15`), `'Malaysia'` (`desk-vocabulary.mjs:68` → `:16`), `field_code 'dunia'` dengan `wheel_visible: true` (`taxonomy-registry.mjs:56` → dropdown `:207-209` melalui `state/editions.js:60,65`).
- Semua kekangan dipenuhi: empat NOT NULL dibekalkan laluan tulis dan `status` lalai `'active'` (`:44,53,67,70,72`); XOR geografi dipenuhi kerana jenis+nilai diisi bersama (`:87-90`); FK `('ms-MY','dunia')` sah (`:94-95` + `db/schema-taxonomy-fields-v1.sql:41`).
- Laluan tulis lengkap hujung ke hujung: `EditionRulesManager.jsx:159-165` → `AdminApp.jsx:453-456` → `editionRulesAdapter.js:21-29` → INSERT RPC (`db/schema-edition-rules-rpc-authenticated-patch-v2-hotfix.sql:73-79`).

**Kaveat (tiada satu pun memerlukan perubahan skema)**
- Salinan admin bagi rule built-in tidak identik dari segi provenance: `classification_rule` menjadi UUID (`edition-rules-resolver.mjs:62` → `edition-classification.mjs:107`) berbanding slug `'foreign_politics_to_world'` (`:131`).
- Tiada UNIQUE, jadi pendua rule built-in boleh dicipta (`db/schema-edition-rules-v1.sql:39-96`).
- Admin boleh melindung tetapi tidak boleh memadam atau mematikan rule built-in (`edition-classification.mjs:118`).
- `condition_subject` NOT NULL (`:53`) bermakna rule "geografi sahaja" tidak boleh diwakili — tidak menjejaskan rule sasaran.

---

## 4. Admin override benar-benar menang atas default? **YA secara struktur, tetapi ada satu lubang**

**Bukti YA**
- `resolveAdminEditionRule` dipanggil dahulu dan pulang awal (`classification/edition-classification.mjs:97`, blok pulang `:98-115`); `evaluateEditionRules` built-in hanya dicapai selepas itu (`:118`). Kemenangan ini ialah URUTAN kod, bukan perbandingan nombor — jadi rule admin berkeutamaan 0 tetap mengalahkan built-in berkeutamaan 2 (`classification/lib/edition-rules.mjs:19`; konvensyen terbalik diperakui di `edition-rules-resolver.mjs:11-13`).
- Perincian per-edisi berlaku di `edition-classification.mjs:265` (penapis kesamaan `edition_id`, tiada kes NULL global).
- Edition rules admin dinilai tanpa syarat, tidak dipagar `if (item)` seperti classification rules (`:66` lawan `:97`).

**Lubang** — lihat K2: seri keutamaan menolak KEDUA-DUA rule (`edition-rules-resolver.mjs:36`) dan jatuh kembali kepada built-in. Tiada tie-break kekhususan, tidak seperti penyelesai adiknya (`classification/lib/classification-rules-resolver.mjs:52-54`), jadi rule sempit tidak mengalahkan rule luas yang bertindih (`edition-rules-resolver.mjs:26-29` mengakuinya secara eksplisit).

**Dua fakta keutamaan lain yang perlu masuk skop**
- **Classification Rule mengatasi Penempatan Berita sepenuhnya.** Blok `resolveClassificationRule` pulang awal di `edition-classification.mjs:66-86`, SEBELUM `:97`. Untuk mana-mana berita yang dipadan rule sumber (ditulis dari `ui/src/admin/BidangPanel.jsx:49`), rule penempatan tidak akan menyala langsung.
- Rule aktif yang menyasarkan taxonomy field diarkib akan senyap tidak menyala (`edition-rules-resolver.mjs:58-59` + `taxonomy-registry.mjs:118`), sementara UI masih menyenaraikannya sebagai aktif.

---

## 5. Placement berlaku SELEPAS classification, tanpa mengubah classifier? **YA**

- `understandStory(item)` menerima item mentah sahaja — tiada parameter edisi, rule atau penempatan (`classification/story-understanding.mjs:74`, pulangan `:119-122`).
- Subjek dan geografi dikumpul dalam dua array bebas (`story-understanding.mjs:75-76`), dan penyelesai hanya MEMBACA calon teratas (`edition-rules-resolver.mjs:51-52`). Geografi tidak boleh mengubah subjek yang telah diputuskan.
- Urutan panggilan sebenar: `db/classify-production.js:129` (`understandStory`) → `:136` (`classifyForAllEditions`).
- Fakta pengelasan tidak ditulis ganti: `subject_code` diambil daripada pengesanan sebenar walaupun pada cabang rule penempatan (`edition-classification.mjs:103`), dan ditegaskan ujian (`classification/edition-rules-resolver.test.mjs:90-91`).
- Tiada tulis balik ke sumber: `story_clusters` hanya di-SELECT (`db/classify-production.js:99`); satu-satunya tulisan ialah ke `edition_story_classifications` (`:212`, `:222-223`).
- Penyelesai tidak mengubah apa-apa dan tidak menyoal DB (`edition-rules-resolver.mjs:43-45`).

**Nota yang mengubah maksud praktikalnya (bukan menjadikan jawapannya "tidak")**: penempatan tidak dikira semasa paparan. Ia dikira sekali secara berkelompok dan disimpan; pembaca membaca nilai tersimpan (`productionAdapter.js:50-52`, `:168-171`, `:199` → `state/reducer.js:145` → `ui/src/components/ActiveSetList.jsx:34`). Lihat K1.

---

## 6. Perubahan minimum, fail demi fail (cadangan, bukan pelaksanaan)

TIADA migration diperlukan. Jangan sentuh: `db/schema-edition-rules-v1.sql`, `classification/lib/edition-rules-resolver.mjs`, `classification/lib/edition-rules.mjs`, `classification/edition-classification.mjs`, `state/*`, `ui/src/adapter/productionAdapter.js`.

**1. `ui/src/admin/EditionRulesManager.jsx`** — beban terbesar, semuanya lapisan paparan:
- `:43` buang h3 "Paparan Edisi — {editionLabel}" supaya halaman tinggal satu tajuk (h2 shell sudah menyebut "Penempatan Berita") — ini keputusan susun atur, perlu arahan eksplisit.
- `:44-47` ganti dengan ayat huraian sasaran.
- `:177` "Jika bidang:" → istilah "kategori"; `:204`/`:206` buang "seksyen".
- `:15`/`:180` dan `:16`/`:198` papar label Melayu sebagai teks pilihan, kekalkan kod Universal sebagai `value` — nilai TERSIMPAN mesti kekal Inggeris kerana `edition-rules-resolver.mjs:20-22` membandingkan rentetan sama-tepat.
- `:96-98` papar label Melayu untuk nilai tersimpan, bukan rentetan mentah.
- `:184-201` gabungkan dua dropdown geografi menjadi SATU ("Luar Malaysia" = `type:'not'`+`value:'Malaysia'`; "Dari Malaysia" = `'is'`). Gubahan UI semata-mata, tiada kesan skema.
- `:95-101` tukar baris flex kepada jadual dengan tajuk lajur "Berita | Lokasi | Paparkan dalam".
- `:78` tukar `activeRules.length + 1` kepada `max(priority) + 1` merentas SEMUA rule (aktif dan arkib) — satu baris, menutup K2 tanpa migration.
- tambah notis bahawa rule berkuat kuasa selepas pengelasan seterusnya dijalankan (K1).

**2. `ui/src/admin/BidangPanel.jsx`** — `:884-886` salinan pengenalan; `:908` tajuk placeholder pendua bagi edisi bukan ms-MY; pagar ms-MY di `:887` kekal.

**3. Peta label Melayu ⇄ Universal Subject/Geography** — perlu satu sumber baharu atau lanjutan `ui/src/admin/kategoriLabel.js` (yang sudah menetapkan prinsip "never show the raw token", `:82-83`). Amaran: pemetaan `taxonomy-registry.mjs` bukan 1:1 — `'bisnes'` memetakan dua subjek (`:59`), Nasional/Dunia mempunyai `subject_codes: null` (`:55-56`), dan `'Disaster'` tiada langsung dalam `desk-vocabulary.mjs`. **Senarai mana yang patut muncul dalam dropdown "Berita kategori" ialah keputusan produk, bukan keputusan kod — audit ini tidak memilihnya.**

**4. `ui/src/admin/editionRulesAdapter.js:16,30,36,41`** — buang awalan nama fungsi daripada mesej ralat yang dipaparkan kepada admin.

**5. `ui/src/admin/copyLint.test.mjs:27-31`** — tambah istilah terlarang ("seksyen", dan lain-lain) supaya peraturan bahasa dikuatkuasakan ujian, bukan disiplin manusia.

**6. `db/classify-production-wiring.test.mjs`** — tambah kes 5-argumen (K3). Kos rendah, menutup wiring yang kini langsung tanpa ujian.

**Di luar skop minimum 8E, disenaraikan untuk keputusan**: pencetus automatik untuk `classify-production.js` (punca sebenar K1), UNIQUE pada keutamaan (ini memerlukan migration), tie-break kekhususan dalam penyelesai, kemasukan `'Disaster'` ke `desk-vocabulary.mjs`, dan amaran UI untuk rule yang menyasarkan taxonomy field diarkib.

---

## Tidak dapat disahkan

- Sama ada fail skema/RPC `edition_rules` benar-benar TELAH digunakan pada Supabase pengeluaran. Pengepala fail bercanggah: `db/schema-edition-rules-rpc-v1.sql:21` dan `db/schema-edition-rules-rpc-authenticated-patch-v1.sql:42` menyatakan "NOT YET APPLIED", tetapi `db/schema-edition-rules-rpc-authenticated-patch-v2-hotfix.sql:3-4,16` menyatakan patch v1 "already applied to production" dan "Confirmed live".
- Sama ada mana-mana baris wujud dalam `edition_rules` pengeluaran — jadual dihantar kosong dengan sengaja (`db/schema-edition-rules-v1.sql:14-16`).
- Sama ada baris `('ms-MY','dunia')` benar-benar wujud dalam `taxonomy_fields` hidup. Skrip backfill ialah salinan 1:1 berketentuan yang berhenti jika bukan tepat 45 baris (`db/backfill-taxonomy-fields.mjs:36-41`), tetapi tiada rekod pelaksanaan `--write` dalam repo — jadi ini JANGKAAN, bukan pemerhatian.
- Sama ada sesiapa menjalankan `classify-production.js` mengikut jadual di luar repo (cron pelayan, kebiasaan manusia). Yang pasti: tiada apa-apa di dalam repo memanggilnya.
- Sama ada label taxonomy hidup masih sepadan dengan fallback hardcode — `taxonomy-registry.mjs:114-137` menulis ganti registry semasa boot, dan audit ini hanya membaca literal fallback.
- Sama ada senario perlanggaran keutamaan (K2) pernah berlaku pada data sebenar. Laluan kod pasti; kandungan baris tidak dapat dilihat daripada sumber.
- Ujian tidak dijalankan (audit baca-sahaja) — semua kenyataan tentang ujian datang daripada membaca fail ujian itu sendiri.
- Sama ada "peraturan keras" tentang perkataan tertentu (contohnya "seksyen") wujud sebagai dokumen. Ia tiada dalam repo; satu-satunya kunci istilah bertulis yang ditemui ialah `docs/backend-control-plane-implementation-plan-v1.md:12-15`.
