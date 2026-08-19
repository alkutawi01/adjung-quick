# Skor V1 — dasar cadangan (simulasi, BUKAN production)

Pusingan 11/15 (2026-08-19), disediakan atas arahan Izzat: "awak kan AI, guna
kemampuan AI utk menilai... Quick patut datang dengan judgement editorial
lalai yang baik. Izzat hanya menyunting judgement itu, bukan membina otaknya
dari kosong."

**Status: simulasi sahaja.** `ranking/candidate-scoring.mjs` (formula LIVE
sebenar untuk ms-MY.Politik) TIDAK disentuh. `ranking/scoring-v1-simulation.mjs`
ialah fail berasingan, hanya dipanggil oleh `db/scoring-v1-simulation.mjs`
(skrip Node baca-sahaja) untuk perbandingan. Tiada wiring ke Admin Console
atau ranking production pusingan ini.

## Dasar skor (Faktor | Berat | Aktif/Tidak | Laras)

| Faktor | Berat | Aktif | Laras |
|---|---:|---|---|
| Kebaruan (susut ikut bidang) | 25 | Aktif | Kadar susut BEZA ikut `field_code` — cepat (jenayah/sukan/hiburan), perlahan (bencana/kesihatan), evergreen (budaya/gaya hidup/sains/agama/pendidikan), normal (selebihnya). |
| Kepercayaan sumber | 20 | Aktif | `sources.trust_score / 100 * 20` — dinormalkan, BUKAN skor mentah 0-100 formula lama. |
| Kepentingan awam | 0 | **Tidak aktif** | **BELUM TERSEDIA** — tiada metadata capaian/audiens dalam skema. |
| Skala kesan (negara/negeri/komuniti) | 0 | **Tidak aktif** | **BELUM TERSEDIA** — GEOGRAPHY_VOCABULARY kesan LOKASI disebut, bukan SKOP AKIBAT. |
| Kekuatan peristiwa | 0 | **Tidak aktif** | **BELUM TERSEDIA** — content-rules kesan SUBJEK (Bencana/Jenayah/dll), bukan MAGNITUD peristiwa dalam subjek itu. |
| Kebaharuan maklumat (bukan ulangan) | 10 | Aktif | Penalti pertindihan — kira bilangan tajuk lain yang hampir sama (Jaccard >= 0.6, guna `diversity-selection.mjs::titleSimilarity` sedia ada) dalam kelompok sama. |
| Kerelevanan kepada edisi | 0 | **Tidak aktif** | **BELUM TERSEDIA** — penempatan bidang itu sendiri SUDAH signal ini; tiada gred berasingan tersimpan. |
| Keyakinan pengelasan | 5 | Aktif | `classification_confidence x 5`, kecil/sekunder — falsafah sama `candidate-scoring.mjs`. |
| Keutamaan editor (boost) | 8 | Aktif | +8 rata bila override boost aktif — **diturunkan drpd +40** Pusingan 12 selepas ujian sensitiviti sebenar (lihat bawah). |

5 daripada 9 faktor yang Izzat cadangkan **tiada metadata boleh dipercayai**
buat masa ini — sengaja ditanda Tidak Aktif/berat 0, bukan direka guna
proksi/keyword palsu ("kerajaan +15" ditolak eksplisit oleh Izzat sendiri).

## Dapatan simulasi (sampel sebenar: 200 berita, 11 bidang, 25 sumber, ms-MY)

Skrip: `node db/scoring-v1-simulation.mjs` (baca-sahaja, anon key).

**Dapatan paling penting — punca sebenar kenapa formula lama nampak "waras"
untuk sesetengah berita ialah `sourceTrust` MENTAH (skala 0-100, tidak
dinormalkan) yang secara struktur menguasai jumlah skor.** Contoh sebenar
diperiksa: "Kai Le pecahkan rekod SUKMA berusia 26 tahun" (rss-utusan-sukan,
trust=95, keyakinan=0.99) --
- Formula lama: freshness 50 + sourceTrust **95** + confidence 9.9 = 154.9 (#3)
- Skor V1: freshness 8 + sourceTrust **19** (dinormalkan) + duplikasi 10 +
  confidence 4.95 = 41.95 (~#121)

Ini BUKAN pepijat V1 — ia pembetulan struktur formula lama: mana-mana artikel
dari sumber kepercayaan tinggi (95+) automatik dapat ~95 mata rata-rata tanpa
mengira kepentingan sebenar berita itu, itulah sebab dapatan #3 semasa
semakan ("Kepercayaan sumber dominan dalam top 10 baharu: 6/10") turut
berlaku pada 200-sampel ini. V1 menormalkan sourceTrust ke siling 20 supaya
ia sumbang secara berkadar, bukan menguasai.

Lima semakan kesalahan (per arahan Izzat), hasil sebenar:
1. **Berita "remeh" naik terlalu tinggi**: 9 kes -- diperiksa manual, majoriti
   sebenarnya berita amaran cuaca/gempa/bencana SEBENAR yang formula LAMA
   underrank (bukan berita remeh sebenar, sekadar tidak dari sumber
   kepercayaan tertinggi).
2. **Berita penting jatuh terlalu rendah**: 2 kes (kedua-duanya berita sukan
   rekod SUKMA) -- punca ialah normalisasi sourceTrust (lihat atas), bukan
   kadar susut. Kekal sebagai OPEN finding -- belum cukup bukti sama ada
   ini betul (skor lama terlalu tinggi sebab trust) atau perlu faktor
   "kepentingan berita" (BELUM TERSEDIA) untuk betul-betul selesaikan.
3. **Kepercayaan sumber dominan**: 6/10 dalam top 10 V1 -- dijangka, sebab
   V1 sengaja normalkan (bukan buang) faktor ni; nisbah 6/10 masih tinggi,
   subjek pelarasan berat pusingan akan datang jika Izzat rasa masih
   dominan selepas semakan visual sebenar.
4. **Kebaruan dominan**: 4/10 -- munasabah, tiada isu.
5. **Satu bidang membolot semua** (bencana 8/10): **CAVEAT SIMULASI, BUKAN
   dapatan production sebenar** -- simulasi ni sengaja ranking MERENTASI
   SEMUA bidang serentak (untuk perbandingan lama/baharu dalam satu jadual).
   Production TIDAK PERNAH ranking merentasi bidang -- setiap bidang ada
   Active Set berasingan (`state/reducer.js::selectFieldActiveSet`,
   dipanggil sekali per bidang dipilih). "Membolot" ni tak boleh berlaku
   dalam production sebenar dgn seni bina semasa; dilaporkan jujur sebagai
   ciri persediaan simulasi, bukan pepijat dibetulkan secara paksa (memaksa
   kepelbagaian bidang pada peringkat SKOR akan mengelirukan tanggungjawab
   Diversity Selection/Composition -- itu kerja peringkat lain, bukan
   Nilai Berita).

Dua pusingan pelarasan kadar susut dibuat (lihat komen "Iteration 1"/
"Iteration 2" dalam `ranking/scoring-v1-simulation.mjs`) berdasarkan dapatan
sebenar #2 di atas -- kurva 'fast' asal terlalu curam (terus ke 0 selepas
24 jam), dilembutkan kepada penurunan berperingkat sehingga 4 hari.

## Pusingan 12/15 — kalibrasi PER BIDANG (bukan merentasi bidang)

Arahan Izzat: uji ikut cara production SEBENAR bekerja -- ranking per
(edisi, bidang) berasingan, bukan satu senarai gabungan. Korpus penuh
dibaca semula (534 berita, 14 bidang, 34 sumber -- bukan sampel 200 lagi,
sebab per-bidang perlu cukup bilangan setiap bidang). Skrip:
`node db/scoring-v1-simulation.mjs`.

### Metodologi

1. Kumpul semua calon layak ikut `field_code`.
2. Skor + susun SETIAP bidang secara berasingan (sama persis
   `state/reducer.js::selectFieldActiveSet`'s per-bidang contract).
3. Papar top 10 lama vs V1 bagi 6 bidang wakil: politik, bencana, sukan,
   bisnes, nasional, jenayah.
4. Ujian sensitiviti sebenar terhadap dua faktor yang Izzat minta khusus
   diuji: boost editor dan keyakinan pengelasan.

### Penilaian editorial (Claude sebagai penilai manual)

Per arahan eksplisit ("Claude sendiri jadi penilai editorial... beri
penilaian manusia/AI secara manual"), tajuk sebenar top-10/bottom setiap
bidang wakil dibaca dan dinilai secara kualitatif (bukan algoritma
tambahan, bukan wired ke backend -- penilaian ini WUJUD hanya dalam
dokumen ini sebagai benchmark, sama seperti editor membaca senarai berita
dan memberi pandangan):

- **Bencana** (amaran cuaca, gempa Flores berganda, kebakaran hutan
  Belgium): kepentingan awam TINGGI, kekuatan peristiwa TINGGI (nyawa/
  kerosakan). V1 letak ini betul-betul di top -- SEPADAN penilaian manual.
- **Politik** (LDP mahu Anwar terus pimpin, DAP gesa PM): kepentingan awam
  sederhana-tinggi (isu kepimpinan negara), tiada satu berita "besar"
  jelas mengatasi yang lain dalam sampel ini -- semua tergolong "kenyataan
  rutin" berbanding keputusan dasar besar. V1 tak dapat bezakan ini drpd
  satu sama lain (skor 46 hampir rata) -- SEPADAN dgn keterbatasan sebenar
  (tiada faktor "Kekuatan peristiwa" aktif), bukan kesilapan V1 per se.
- **Sukan** (Kai Le/Badang muda pecah rekod SUKMA): kepentingan awam
  sederhana (pencapaian sukan kebangsaan), kebaharuan tinggi. V1 letak
  betul di top 1-2 DALAM BIDANG SUKAN sendiri -- SEPADAN. (Nota: dalam
  ujian merentasi-bidang Pusingan 11, berita sama ni "jatuh" ke #121+ --
  itu cuma sebab ia bersaing dgn SEMUA bidang lain sekali, bukan realiti
  production; per-bidang di sini ialah ujian yang betul.)
- **Bisnes** (Kerjaya Prospek kuasai saham, BSN Takaful, Shopee banteras
  penipuan): kepentingan awam RENDAH-SEDERHANA (berita korporat rutin,
  bukan dasar ekonomi negara). V1 letak semua ini hampir sama tinggi (46)
  dgn SATU pengecualian sebenar -- "Ekonomi Malaysia berkembang 6 peratus"
  (data makroekonomi kebangsaan, kepentingan awam lebih tinggi) yang
  sepatutnya menonjol tetapi TAK menonjol (kedudukan #26 dlm ujian
  sensitiviti). Ini KEGAGALAN sebenar -- lihat senarai di bawah.
- **Jenayah** (bunuh ahli perniagaan/tular memandu berbahaya drpd RTM
  vs Caprice bayar RM220k/tuntutan insurans drpd Kosmo/Metro): kekuatan
  peristiwa jenayah RTM (bunuh, membahayakan nyawa awam) SEPATUTNYA lebih
  tinggi drpd tuntutan sivil/insurans, tetapi V1 letak sebaliknya (Caprice
  #1, RTM #5-6) kerana RTM sedikit lebih lama diterbitkan + sourceTrust
  RTM/Kosmo/Metro hampir sama. Ini KEGAGALAN sebenar -- "Kekuatan
  peristiwa" (bunuh > tuntutan sivil) ialah tepat faktor BELUM TERSEDIA
  yang diperlukan di sini.
- **Nasional** (kemalangan maut RM30b, pemansuhan AUKU, sekolah Serian):
  kepentingan awam bervariasi tinggi (kemalangan jalan raya kebangsaan)
  ke sederhana (kolum pendapat). V1 tak bezakan -- sama isu "Kekuatan
  peristiwa" seperti Politik/Bisnes di atas.

### Ujian sensitiviti sebenar

**Boost editor** (+3/+5/+8/+10/+15/+20/+40, hipotesis -- SIFAR berita
boosted sebenar wujud dlm korpus semasa utk diuji terhadap data
sebenar, dilaporkan jujur): pada +40 (nilai production lama), SATU berita
pertengahan-pangkat melonjak ke #1 dalam **SETIAP** bidang diuji, tanpa
kecuali. Ini secara langsung melanggar prinsip `candidate-scoring.mjs`
SENDIRI: *"boost must raise the CHANCE of selection, never guarantee it
... A weight large enough to always win would make boost a pin in
disguise."* +40 ialah pin, bukan boost, dalam skala V1 yang dimampatkan.
Pada +8: bidang kecil (bencana 14, jenayah 35, politik 34, nasional 61)
masih cenderung melonjak ke #1 (julat skor sempit dlm bidang kecil), tapi
bidang besar (sukan 102, bisnes 86) cuma naik ke #12-26 -- lebih sepadan
"naikkan peluang, bukan jamin". **+8 dipilih sbg cadangan**, dgn syarat
jujur: perlu diuji semula terhadap boost SEBENAR sebaik ada satu
digunakan production (belum berlaku setakat ini).

**Keyakinan pengelasan** (x0/x2/x5/x10/x15): 0-2 daripada 10 slot top-10
berubah merentasi SEMUA julat diuji, semua bidang. Faktor ni HAMPIR TIDAK
memberi kesan pada susunan akhir tak kira berat -- sebab keyakinan
pengelasan dlm sampel sangat padat (kebanyakan >0.9). **Berat x5 dikekalkan
tanpa perubahan** -- tiada bukti perlu dibesarkan/dikecilkan, dan
falsafah "kecil/sekunder" memang sengaja begitu.

### 5-10 contoh V1 membaiki formula lama

1. Amaran hujan lebat 4 negeri (#136 lama -> top 1 V1, merentasi bidang) --
   amaran bencana sebenar, sebelum ini underrank sebab bukan sumber
   kepercayaan tertinggi.
2. Gempa Colombia/Flores berganda (#148-170 lama -> top 2-4 V1) -- sama
   punca, berita bencana antarabangsa asli yang sebelum ini tenggelam.
3. Dalam BIDANG SUKAN sendiri: Kai Le/Badang muda SUKMA KEKAL di top 1-2
   (bukan jatuh) apabila diuji per-bidang -- formula lama DAN V1 setuju di
   sini; Pusingan 11's "kejatuhan" adalah artifak ujian merentasi-bidang,
   bukan kegagalan V1 sebenar. Disenaraikan di sini kerana ia PEMBETULAN
   kepada dapatan silap Pusingan 11 sendiri, bukan kelemahan V1.
4. Artikel bisnes rutin (Kerjaya Prospek, BSN Takaful, Shopee, dll) tak
   lagi tergolong SAMA tinggi (154.9) dgn berita bencana besar hanya sebab
   sumber sama kepercayaan tinggi -- V1 letak semua ini di bawah bencana
   yg genuinely lebih penting.
5. +40 boost (berpotensi menjamin #1 tanpa mengira apa-apa) dikesan dan
   diperbetulkan ke +8 sebelum sempat jadi masalah production sebenar.
6. Kurva susut sukan/jenayah/hiburan yang terlalu curam (ke 0 selepas
   24 jam) dikesan+dibetulkan menggunakan bukti sebenar (berita SUKMA
   44 jam berumur), bukan andaian.

### 5-10 contoh V1 masih gagal (perlu Kekuatan Peristiwa/Kepentingan Awam)

1. "Ekonomi Malaysia berkembang 6 peratus" (data makroekonomi kebangsaan)
   TAK menonjol drpd artikel bisnes korporat rutin dlm bidang Bisnes --
   sepatutnya kepentingan awam lebih tinggi.
2. "Empat lelaki didakwa bunuh ahli perniagaan" / "Tular aksi memandu
   berbahaya" (RTM, jenayah serius) diletak DI BAWAH "Caprice diperintah
   bayar RM220,000" (tuntutan sivil selebriti) dalam bidang Jenayah --
   songsang drpd kekuatan peristiwa sebenar.
3. Dalam Politik: kenyataan rutin ahli parti ("Kebebasan mahasiswa perlu
   bimbingan") dan pengumuman dasar sebenar (peruntukan RM1 juta setiap
   parlimen) hampir tak dibezakan (skor 46 vs 45) -- kekuatan peristiwa
   dasar sepatutnya lebih ketara drpd kenyataan am.
4. Dalam Nasional: kemalangan jalan raya kebangsaan (impak awam luas,
   6,537 nyawa) dan kolum pendapat individu turut hampir tak dibezakan.
5. Tiada cara membezakan "kematian besar/bencana besar-besaran" drpd
   "kejadian sederhana dalam kategori sama" -- content-rules kesan SUBJEK
   sahaja (cth "Bencana"), bukan magnitud (1 nyawa vs 100 nyawa).

### Senarai Future Signal diperlukan (bukan sekarang)

- **Skala kesan tersimpan** — bukan sekadar lokasi disebut, tapi anggaran
  bilangan terjejas/skop geografi sebenar (perlukan sumber data baharu,
  cth taburan geografi rasmi atau metadata dari sumber sendiri).
- **Magnitud peristiwa** — pembezaan dalam SATU subjek (cth "Bencana": 1
  nyawa vs 100 nyawa; "Jenayah": tuntutan sivil vs bunuh) — mungkin boleh
  dianggarkan drpd bilangan/nombor tersebut disebut dlm tajuk/huraian
  (cth regex tangkap angka "X nyawa"/"RM X juta"), TAPI ini belum wujud
  dan perlu reka bentuk berasingan, bukan dianggap sedia ada.
- **Metadata capaian/audiens** — tiada langsung dalam skema semasa;
  memerlukan integrasi analitik pembaca sebenar (di luar skop ranking).
- **Data boost SEBENAR** — ujian sensitiviti boost di atas hipotesis
  semata (sifar boost aktif dlm korpus semasa); +8 perlu disahkan semula
  sebaik editor benar-benar guna boost dlm production.

## Langkah seterusnya (bukan pusingan ini)

Kalau Izzat rasa hasil simulasi ini waras selepas semakan sendiri: pusingan
akan datang tentukan storan (`Faktor | Berat | Aktif | Laras` sebagai jadual
Admin boleh laras) DAN laluan mengubah `ranking/candidate-scoring.mjs`
production dengan lebih yakin -- bukan dibuat pusingan ini.
