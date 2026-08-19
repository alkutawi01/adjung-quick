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
| Keutamaan editor (boost) | 40 | Aktif | +40 rata bila override boost aktif — nilai SAMA formula production. |

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

## Langkah seterusnya (bukan pusingan ini)

Kalau Izzat rasa hasil simulasi ini waras selepas semakan sendiri: pusingan
akan datang tentukan storan (`Faktor | Berat | Aktif | Laras` sebagai jadual
Admin boleh laras) DAN laluan mengubah `ranking/candidate-scoring.mjs`
production dengan lebih yakin -- bukan dibuat pusingan ini.
