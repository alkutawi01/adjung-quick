# Polish 9 — Audit Kitaran Hayat, Operasi & Liputan Klasifikasi (2026-08-20)

Status: `[x] 9A selesai (pagination deterministik)` `[x] 9B selesai (audit baca-sahaja)` `[x] 9C selesai (audit baca-sahaja)` `[ ] Tindakan susulan belum diputuskan`

Dijalankan sejurus selepas P0 ditutup rasmi (lihat
`docs/p0-classification-backlog-incident-v1.md`), atas arahan pengarah
teknikal: audit **baca-sahaja**, bukan pembaikan — tujuannya mengukur apa
lagi yang masih bergantung sepenuhnya kepada manusia, sebelum keputusan
edisi global (English/Arabic) dibuat.

Kaedah: 9B dijalankan melalui 4 agen siasatan selari (skrip manual, operasi
tanpa penunjuk, risiko data luput/anak yatim, konsistensi sandaran),
disintesis jadi satu laporan. 9C dijalankan terus oleh saya sendiri
(memerlukan capaian data production sebenar, baca-sahaja) — soal SQL
langsung terhadap `edition_story_classifications` production, disahkan
silang dengan kod pengelas sebenar.

---

## Polish 9B — Audit Kitaran Hayat & Operasi

### 1. Ringkasan Eksekutif

Insiden P0 malam ini mendedahkan bukan sekadar satu, tetapi sekurang-kurangnya
sembilan kebergantungan manual yang tiada sebarang penunjuk kegagalan —
bermakna sistem akan kelihatan tenang walaupun sebenarnya sudah terhenti
berfungsi di sebalik tabir. Dua daripadanya secara langsung menyebabkan
gangguan malam ini: pelupusan jadual `_old` selepas pertukaran (*swap*)
ingestion, dan kelewatan klasifikasi (kini telah dibaiki bagi kitaran
ingestion biasa, tetapi masih menumpang sepenuhnya kepada ingestion
dijalankan secara manual). Walau bagaimanapun, dapatan paling kritikal audit
ini bukan salah satu daripada dua isu tersebut — ia ialah sandaran (*backup*)
data produksi: tiada rekod bila ia terakhir dijalankan, tiada mekanisme
sandaran berbayar/automatik wujud, dan skrip pelupusan `_old` yang sama
digunakan untuk membuka semula ingestion malam ini langsung tidak menyemak
kesegaran sandaran sebelum bertindak. Corak sepunya keempat-empat laporan:
hampir semua operasi kritikal — ingestion, klasifikasi, pembersihan data
luput, audit rekod anak yatim, dan sandaran — bergantung sepenuhnya kepada
seseorang mengingati untuk menaip arahan, tanpa sebarang penjadual automatik
atau penunjuk kegagalan di UI Admin.

### 2. Senarai Risiko, Disusun Ikut Keutamaan

**1. Sandaran produksi tiada rekod "bila terakhir dijalankan" di mana-mana,
dan skrip pelupusan `_old` tidak menyemak kesegaran sandaran sebelum
bertindak.** `snapshot-production.mjs` ialah satu-satunya mekanisme sandaran
bagi kandungan editorial (Supabase Free Plan, tiada PITR); output tersimpan
tempatan sahaja dan disalin ke Google Drive secara *fire-and-forget* — jika
Drive tidak dipasang, ia gagal senyap ("dilangkau dengan amaran, bukan
kegagalan"). Rekod terakhir yang boleh disahkan ialah 2026-08-13; status
selepas itu tidak dapat disahkan langsung daripada repositori. Kegagalan
sandaran hanya akan diketahui semasa pemulihan — iaitu sudah terlambat.
*Cadangan:* simpan cap masa larian terakhir di tempat yang boleh disemak,
dan jadikan sandaran segar sebagai syarat wajib sebelum skrip pelupusan
`_old` dibenarkan berjalan.

**2. Pelupusan jadual `_old` selepas swap ingestion — manual, tiada amaran
awal, telah menyekat dua percubaan ingestion sebenar malam ini.** Fungsi
pertukaran data akan gagal jika generasi `_old` terdahulu belum dilupuskan,
tetapi kegagalan ini hanya diketahui *selepas* ingestion cuba dijalankan —
tiada apa-apa memberitahu editor "jadual lama masih ada, ingestion
seterusnya akan gagal" sebelum masa itu tiba. *Cadangan:* papar semakan
kewujudan jadual `_old` di Admin Ringkasan atau sebagai langkah pra-jalan
ingestion, bukan didedahkan sebagai ralat swap.

**3. Lapisan amaran operasi (`daily-observation.mjs`) langsung gelap jika
tidak dijalankan secara manual.** Skrip ini mengira amaran sebenar (ingestion
terhenti, kolam ranking kosong, sumber rosak belum ditanda pulih) tetapi
hanya terpapar pada terminal sesiapa yang menjalankannya — UI Admin tidak
pernah menerima isyarat ini, dan baris berkaitan hanya berhenti dipaparkan
(bukan bertukar merah) apabila data tiada. Corak ini sama persis dengan
punca insiden P0 klasifikasi malam ini. *Cadangan:* tulis output amaran ke
jadual yang boleh disoal, dan papar tarikh larian terakhir di kepala digest
Admin.

**4. Ingestion sendiri tiada penjadual automatik dan tiada penunjuk
"kandungan terkini bila" di UI.** Tiada *cron*, GitHub Action, atau pencetus
automatik wujud dalam repositori bagi ingestion; medan
`last_success_at`/`last_failure_at` sedia ada pada setiap sumber tetapi
tidak pernah dipaparkan. Ini punca akar kepada hampir semua risiko lain
dalam senarai ini. *Cadangan:* papar "Kandungan terbaharu: N jam lalu" di
Admin Ringkasan, tidak bergantung kepada `daily-observation.mjs` dijalankan.

**5. Audit rekod anak yatim editorial (`audit-orphan-editorial-state.mjs`)
tidak disambungkan kepada rantaian automatik pasca-swap**, walaupun
dokumentasinya sendiri mengarahkan ia dijalankan "sebelum sebarang percubaan
swap ingestion seterusnya". Pin, simpanan dan sejarah editor yang menuding
kepada cluster yang telah dipadam semasa swap akan kekal dalam pangkalan
data tanpa dikesan sehingga seseorang menjalankan audit ini secara manual.
*Cadangan:* sambungkan pemeriksaan ini ke rantaian pasca-swap yang sudah
automatik bagi klasifikasi.

**6. Status Migrasi A/B/C (had FK, sempadan swap) tidak konsisten antara
dokumen dan kod produksi sebenar.** Setiap fail migrasi menyatakan "belum
diguna pakai" pada tajuknya, tetapi satu dokumen lain menyatakan Migrasi B
sebenarnya telah diguna pakai secara langsung dan mencetuskan pepijat
(`repoint_story_clusters_fks()` menambah semula FK yang sepatutnya dibuang
pada setiap swap) — pepijat ini masih wujud, belum ditampal, dalam skema
yang dikomit. Tiada dokumen mengesahkan Migrasi C pernah diguna pakai.
*Cadangan:* sahkan status sebenar terhadap produksi (bukan hanya baca
tajuk fail), kemas kini rekod, dan tampal pepijat FK jika ia disahkan masih
aktif.

**7. Klasifikasi kini automatik selepas ingestion, tetapi dua jurang
kekal terbuka:** penukaran nama taksonomi tidak dikesan (medan hanya teks
biasa), dan perubahan peraturan pengelas tanpa ingestion baharu memerlukan
larian manual `--write`. Kedua-duanya menyebabkan kandungan kekal
berklasifikasi lapuk secara senyap. *Cadangan:* sudah dikenal pasti sebagai
kerja Fasa 4.2.2; tiada tindakan segera diperlukan melainkan taksonomi
berubah dalam masa terdekat.

**8. Jam luput `expires_at`/`review_expires_at` pada `story_clusters` direka
dalam skema tetapi tidak pernah ditetapkan atau dibaca oleh mana-mana kod.**
Setiap baris baharu daripada ingestion kekal `NULL` pada kedua-dua medan;
luput cluster sebenarnya berlaku hanya melalui penggantian keseluruhan
jadual semasa swap. Risiko rendah pada masa ini kerana swap tetap
membersihkan data lama, tetapi ini jurang reka bentuk-vs-realiti yang perlu
direkodkan. *Cadangan:* kemas kini komen skema untuk menyatakan status
sebenar.

**9. `story_overrides` berkembang tanpa had** — tiada padam fizikal, hanya
ditapis semasa bacaan. Reka bentuk sengaja, bukan pepijat, tetapi jadual
akan terus membesar tanpa mekanisme penyusutan. *Cadangan:* bukan
keutamaan segera; pantau saiz jadual dari semasa ke semasa.

### 3. Apa Yang Tidak Perlu Risau

- **Klasifikasi kini automatik selepas setiap ingestion** (pembaikan P0-B)
  — disahkan hidup dalam kod. Punca asal insiden malam ini (408 cerita
  ketinggalan) tidak akan berulang bagi kitaran ingestion biasa.
- **Reka bentuk luput `story_overrides`** (tapis semasa bacaan, tiada padam
  automatik) memang sengaja ikut reka bentuk kitaran hayat data yang
  didokumentasikan — bukan kelalaian.
- **Skrip rollback swap** (`rollback-ingestion-swap.mjs`) sengaja kekal
  manual — ini betul secara reka bentuk, kerana rollback sepatutnya
  sentiasa memerlukan pengesahan manusia.
- **Keputusan Free Plan Supabase + Google Drive sebagai sandaran** adalah
  keputusan termaklum Izzat sendiri yang didokumenkan, bukan kelalaian yang
  tidak disedari — walaupun cara pelaksanaannya (Risiko #1) masih perlu
  diperbaiki. Automasi ingestion telah dilancarkan sejak keputusan itu
  dibuat, iaitu salah satu daripada tiga pencetus naik taraf yang dinamakan
  dalam keputusan asal — patut disemak semula sama ada pencetus itu sudah
  wajar tercetus.

### 4. Cadangan Susunan Kerja Selepas Ini

Audit ini bertujuan mengukur, bukan mewajibkan pembaikan. Susunan berikut
memberikan pulangan tertinggi bagi kos terendah, jika dipilih untuk
bertindak:

1. Tambah semakan kesegaran sandaran sebagai syarat sebelum skrip pelupusan
   `_old` dibenarkan berjalan, dan simpan cap masa larian sandaran terakhir
   di tempat yang boleh disemak.
2. Papar penunjuk proaktif "jadual `_old` masih ada" di Admin Ringkasan
   sebelum percubaan ingestion seterusnya.
3. Papar cap masa "ingestion terakhir berjaya" dan "data operasi terkini"
   di Admin Ringkasan, tidak bergantung kepada `daily-observation.mjs`
   dijalankan.
4. Sambungkan audit rekod anak yatim editorial ke rantaian pasca-swap yang
   sedia ada.
5. Sahkan status sebenar Migrasi A/B/C terhadap produksi, kemas kini rekod,
   dan tampal pepijat FK jika disahkan masih aktif.

---

## Polish 9C — Audit Liputan Klasifikasi

Diukur terus daripada data production sebenar (baca-sahaja) selepas
ingestion ketiga malam ini (554 kandungan diproses, generasi terkini).

### Pecahan sumber tidak terklasifikasi

**ms-MY:**

| source_id | bilangan tidak terklasifikasi |
|---|---|
| `rss-rtm-sukan` | 10 |
| `rss-metro` | 9 |
| `rss-bernama-bm` | 1 |
| `rss-utusanborneo-sabah` | 1 |
| `rss-rtm-hiburan` | 1 |

**en-global:**

| source_id | bilangan tidak terklasifikasi |
|---|---|
| `rss-aljazeera-en` | 16 |
| `rss-bbc-world` | 14 |
| `rss-bernama-bm` | 1 |
| `rss-guardian-world` | 1 |

### Dua punca berbeza, disahkan terhadap kod sebenar

**Punca 1 — jurang perbendaharaan kata STRUKTUR (URL), bukan kandungan.**
`rss-rtm-sukan` (dan berkemungkinan feed RTM lain berstruktur sama:
`rss-rtm-hiburan`, dsb.) menggunakan corak URL
`.../senarai-berita-sukan/senarai-artikel/...` — segmen URL ini SECARA
JELAS menyatakan subjek kandungan (sukan). Sistem pengelas MEMANG direka
untuk mengesan isyarat sebegini (`deskFromUrl()` + `lookupToken()` di
`classification/story-understanding.mjs`, Tier 2 "URL structure"), tetapi
`classification/lib/desk-vocabulary.mjs` cuma mendaftar kunci `'sukan'` dan
`'berita-sukan'` — bukan variasi sebenar RTM `'senarai-berita-sukan'`.
Oleh kerana carian ini padanan rentetan TEPAT (tiada pemisahan sempang),
segmen RTM ini langsung terlepas pandang walaupun isyarat yang tepat sudah
sedia ada dalam URL sumber itu sendiri.

Ini **pembaikan murah dan berisiko rendah** — mengesan isyarat yang sumber
itu sendiri sudah sediakan dengan tepat, bukan meneka kandungan. Anggaran:
boleh menutup ~10 daripada baki tidak terklasifikasi ms-MY tanpa menyentuh
peraturan kata kunci kandungan langsung.

**Punca 2 — jurang perbendaharaan kata KANDUNGAN sebenar (Metro, Al
Jazeera, BBC, Guardian).** Tajuk pelbagai (jenayah, kemalangan, penerbangan,
hidupan liar, isu antarabangsa am) tanpa padanan kata kunci dominan dalam
`content-rules.mjs`. Ini sepadan dengan skop "Audit Liputan Klasifikasi"
yang telah ditangguhkan sebelum ini (memo projek) — kerja perbendaharaan
kata editorial sebenar yang memerlukan reka bentuk lanjut, **BUKAN untuk
ditambah pukal tanpa arahan eksplisit**.

### Nota sampingan

`rss-bernama-bm` muncul dalam SENARAI TIDAK TERKLASIFIKASI kedua-dua ms-MY
DAN en-global (1 setiap satu) — jumlah kecil, tidak material, tetapi patut
disemak sebagai kemungkinan kes sempadan kelayakan edisi jika berulang pada
skala lebih besar kelak.
