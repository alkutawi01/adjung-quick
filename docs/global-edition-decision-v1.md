# Adjung Quick — Global Edition Decision v1

Status: `[ ] Bahagian B menunggu keputusan Izzat` — dokumen ini BUKAN spesifikasi
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

## Bahagian B — Keputusan yang masih terbuka (untuk Izzat jawab)

Ini soalan editorial sebenar, bukan soalan teknikal — jawapan bergantung
pada macam mana pembaca sasaran edisi tu sebenarnya cari/faham berita,
bukan pada struktur database. Claude/ChatGPT sengaja tidak mengesyorkan
satu jawapan "betul" — cuma bentangkan konteks sedia ada supaya Izzat buat
keputusan secara sedar.

### B1. Culture + Entertainment untuk ar-global — gabung atau asing?

Status sekarang: **digabung** (`edition-architecture-model.md`, 12 Ogos)
tapi keputusan ni sandar pada bukti nipis. Doc reka bentuk taxonomy sendiri
(`sesi2-edition-taxonomy-design.md`, hari sama) catat bukti bercanggah: Al
Araby (satu-satunya portal Arab dalam kajian tu yang ada nav "سياسة"
Politik berasingan) asingkan Culture dan Entertainment, bukan gabung.
Belum pernah direvisit dengan bukti lebih luas sejak 12 Ogos.

**Soalan untuk Izzat**: nak kekal gabung (macam sekarang), atau asingkan?

### B2. Ekonomi vs Bisnes untuk ms-MY — gabung atau asing?

Status sekarang: **digabung** jadi "Bisnes" (kunci dalam
`edition-architecture-model.md`). Diflag "genuinely undecided" dalam
`sesi2-edition-taxonomy-design.md` §3, tiada doc/commit kemudian yang
tutup soalan ni.

**Soalan untuk Izzat**: pembaca BM lebih faham Ekonomi sebagai satu payung
besar (macam sekarang), atau Ekonomi + Bisnes sebagai dua kategori
berasingan?

### B3. Edition Relevance Layer — perlu wujud atau tidak?

Ini soalan seni bina paling besar dalam senarai ni. Sekarang, aliran
klasifikasi:

```
Cerita -> Classification (subjek universal) -> Field placement (per edisi)
```

Cadangan lama (`edition-classification-contract.md` §4, status
"PROPOSED, tak diimplement") tambah satu lapisan:

```
Cerita -> Classification -> Edition Relevance -> Field placement
```

Bezanya: sekarang, SETIAP cerita yang diklasifikasi akan cuba dapat
penempatan di SETIAP edisi (kalau ada subjek/geografi sepadan). Lapisan
Relevance akan tanya soalan berasingan dulu: "cerita ni memang LAYAK
wujud dalam edisi ni langsung?" — sebelum cuba letak dia dalam kategori.
Contoh: berita dasar AI China mungkin layak untuk en-global (Technology)
dan ar-global (Science/Technology), tapi tak semestinya "layak" untuk
ms-MY walau secara teknikal boleh diklasifikasi sebagai Teknologi.

**Soalan untuk Izzat**: perlukah lapisan Relevance ni sebelum kita
perluaskan `edition_rules` ke en-global/ar-global? Atau cukup dengan
sistem sekarang (classification+placement terus, tanpa lapisan
tambahan)?

### B4. Ranking per edisi — kalibrasi bila?

Status sekarang: `editorial_v1` cuma live untuk `ms-MY.Politik`.

**Soalan untuk Izzat**: bila en-global/ar-global patut dapat kalibrasi
ranking sendiri — serentak dengan pelancaran, atau tunggu data sebenar
terkumpul dulu (macam ms-MY.Politik yang dikalibrasi selepas data sebenar
wujud)? ChatGPT cadang jangan terus aktifkan semua bidang serentak —
persetujuan Izzat diperlukan untuk urutan ni.

### B5. Generalisasi peraturan penempatan (macam `foreign_politics_to_world`)

Status sekarang: cuma SATU rule sistem wujud —
`foreign_politics_to_world` (Politik luar Malaysia → Dunia, bukan
Politik). Sengaja TAK digeneralisasi ke subjek lain
(`classification/edition-rules-resolver.mjs`, komen dalam kod tolak
generalisasi automatik — cth "gempa bumi luar negara patut kekal Bencana
atau jadi Dunia?" ialah soalan editorial berasingan, bukan sambungan
automatik daripada rule politik).

**Soalan untuk Izzat**: patut ke prinsip yang sama (luar negara → Dunia)
digeneralisasi ke Jenayah/Bencana/Alam Sekitar/dll., atau setiap subjek
perlu keputusan berasingan (macam sekarang)?

---

## Bahagian C — Fasa Pelaksanaan (selepas B1-B5 dijawab)

Cadangan ChatGPT, dipersetujui: bukan "siapkan English penuh dulu, baru
Arabic" secara automatik — tapi fasa ikut jenis kerja:

**Phase Global 1 — Stabilize Existing**
Selesaikan B1-B5 (keputusan editorial), bukan tambah ciri baharu.

**Phase Global 2 — Content Expansion**
Tambah sumber (Reuters, AP, DW + sumber Arab tambahan) selepas keputusan
taxonomy/relevance dikunci — supaya sumber baharu diklasifikasi ikut
peraturan yang dah settled, bukan peraturan sementara yang akan berubah.

**Phase Global 3 — Editorial Intelligence**
Perluaskan `edition_rules` content + ranking calibration ke en-global/
ar-global, guna keputusan B1-B5 sebagai asas.

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

## Nota audit — staleness dokumen lama

Beberapa dokumen 18 Ogos (Fasa 4 edition-rules) tertulis "not yet
implemented, awaiting review" tapi commit HARI SAMA menunjukkan ia siap
dilaksanakan. Sesiapa baca doc lama sahaja (tanpa semak kod/commit sebenar)
akan overstate berapa banyak kerja yang belum siap. Dokumen ni cuba
betulkan staleness tu dengan sengaja rujuk kod sebenar (bukan doc lain)
untuk setiap tuntutan dalam Bahagian A.
