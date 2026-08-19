# Polish 6B.1 — Personal State Carry-Forward (Reka Bentuk V1)

2026-08-19. Draf reka bentuk sahaja — **belum dilaksanakan**. Dibawa kepada
ChatGPT untuk semakan sebelum sebarang kod ditulis, per arahan eksplisit.

## Punca (Polish 6B audit)

`db/ingest-production.js` REBUILD SEPENUHNYA `story_clusters`/`rss_items`
setiap kitaran — hanya daripada sumber `active` semasa kitaran itu — kemudian
`swap_ingestion_staging()` (fungsi Postgres, satu transaksi) RENAME staging
jadi live, live sedia ada jadi `*_old`. Ini BUKAN tambahan/incremental.

`saved_stories`/`history_entries` (db/schema-identity.sql) rujuk
`story_clusters.id` terus (FK, tiada `ON DELETE` action). Kalau cerita yang
dirujuk tak muncul semula dalam generasi baharu, rujukan tu jadi dangling
selepas `*_old` di-drop.

`evaluateDestructiveRebuildGuard()` (db/production-write-guard.mjs) sekarang
BLOCK SELURUH ingestion run kalau `saved_stories + history_entries > 0`,
tanpa mengira sama ada cerita yang dirujuk sebenarnya terjejas — "all fail
closed", bukan smart-check. Sub-audit 6B.1 sahkan: TIADA proses cleanup
`expires_at` wujud untuk kedua-dua jadual (schema ada lajur+index, tiada kod
guna).

## Reka bentuk (A–F, ikut struktur ChatGPT)

Semua di `db/ingest-production.js`, selepas write guard persekitaran
(`assertWriteAllowed()`), SEBELUM `buildRankedQueue()`.

### A. Bersihkan personal row tamat tempoh dahulu

**Pembetulan 1 (ChatGPT)**: `--dry-run` TAK BOLEH DELETE data pengguna
sebenar — kontrak `--dry-run` sedia ada (komen atas fail) ialah "stage +
validate, NEVER swap", bukan "tiada kesan production langsung". Guna SATU
`nowIso` tetap sepanjang run; physical DELETE hanya pada non-dry-run, tapi
protected-ID query (B) SENTIASA guna syarat `expires_at > nowIso` — dry-run
"abaikan secara logik" row tamat tanpa memadamnya.

```js
const nowIso = new Date().toISOString(); // SATU nilai, dipakai sepanjang run

if (!DRY_RUN) {
  const delSaved = await supabase.from('saved_stories').delete().lte('expires_at', nowIso);
  if (delSaved.error) { console.error('cleanup saved_stories gagal:', delSaved.error); process.exit(1); }
  const delHistory = await supabase.from('history_entries').delete().lte('expires_at', nowIso);
  if (delHistory.error) { console.error('cleanup history_entries gagal:', delHistory.error); process.exit(1); }
}
```

**Pembetulan 2 (ChatGPT)**: fail closed pada SEBARANG ralat Supabase di
langkah cleanup/protected-query — jangan sekali-kali teruskan dengan andaian
"set protected kosong" bila SELECT/DELETE gagal (di atas sudah tunjuk corak
`if (error) { ...; process.exit(1); }` yang dipakai konsisten di B juga).
Bukan scheduler baharu — ingestion yang memang berulang jadi titik cleanup.

### B. Ambil protected story IDs (SELEPAS cleanup A, guna `nowIso` sama)

```js
const [savedRes, historyRes] = await Promise.all([
  supabase.from('saved_stories').select('story_id').gt('expires_at', nowIso),
  supabase.from('history_entries').select('story_id').gt('expires_at', nowIso),
]);
if (savedRes.error) { console.error('baca saved_stories gagal:', savedRes.error); process.exit(1); }
if (historyRes.error) { console.error('baca history_entries gagal:', historyRes.error); process.exit(1); }
const protectedStoryIds = new Set([...savedRes.data, ...historyRes.data].map(r => r.story_id));
```

### C. Bina corpus baharu — TIADA PERUBAHAN

`fetchFeed()` → `buildRankedQueue()` → staging, tepat macam sekarang. Cerita
lama TAK dimasukkan ke `buildRankedQueue()` — carry-forward (D) berlaku
BERASINGAN, terus ke staging, bukan lalui engine ranking.

### D. Carry-forward story yang masih dirujuk TAPI tiada dalam generasi baharu

```js
const freshClusterIds = new Set(labRankedQueue.map(c => c.clusterKey));
const toCarryForward = [...protectedStoryIds].filter(id => !freshClusterIds.has(id));
```

**Pembetulan 3 (ChatGPT)**: mapping tepat, bukan "kekalkan seboleh mungkin"
(tiada ruang tafsiran semasa implementasi).

Untuk setiap `toCarryForward` — baca dari `story_clusters`/`rss_items` LIVE
(sebelum swap, jadual asal belum jadi `*_old` lagi):

**`story_clusters_staging`** (insert): kekalkan `id`, `topic`,
`freshness_score`/`cross_source_score`/`prominence_score` (skor asal, TAK
dikira semula), `expires_at`, `review_expires_at`, `first_seen_at`,
`updated_at` — SEMUA drpd baris asal, tanpa ubah. Paksa HANYA
`workspace_state = 'expired'` (bukan `'queued'`/`'active'` — reader/ranking
sedia ada dah tapis ikut `workspace_state`, `'expired'` sudah dikecualikan).
`representative_rss_item_id` dimasukkan `NULL` dahulu (circular FK, sama
corak `ingest-production.js` baris ~198-204 untuk cluster segar), di-`UPDATE`
balik ke ID representative ASAL selepas SEMUA item cluster itu selesai
dimasukkan (langkah seterusnya). **Fail closed** jika representative asal
(`story_clusters.representative_rss_item_id` drpd baris LIVE) tiada langsung
dalam senarai item cluster itu yang berjaya dibawa — jangan agak gantian.

**`rss_items_staging`** (insert): salin SEMUA lajur asal tanpa kecuali —
`id`, `source_id`, `cluster_id`, `rss_guid`, `title`, `description`, `link`,
`normalized_url`, `language`, `published_at`, `fetched_at`, `categories`,
`source_known_category`. `fetched_at` KEKAL nilai asal (bukan re-fetch time
run ni) — item ni tak difetch semula.

`source_id` cerita carry-forward mungkin rujuk sumber `disabled` — SAH,
`sources_staging` (per patch 6B-a) bawa SEMUA sumber dalam registry (bukan
cuma aktif). **Fail closed** (ChatGPT's tambahan) jika `source_id` item
carry-forward TIADA dalam `sources_staging` (cth sumber dipadam terus drpd
registry, bukan sekadar `disabled`) — beri mesej jelas ("carry-forward gagal:
source_id X tiada dalam sources_staging"), jangan biarkan INSERT tergelincir
kena FK violation tanpa diagnosis.

### E. Fail closed pada anomali (SEBELUM swap, bukan selepas)

1. Selepas D, sahkan **setiap** `protectedStoryId` ada dalam
   `story_clusters_staging` (sama ada dari C atau D). Kalau satu hilang —
   `process.exit(1)` sebelum panggil `swap_ingestion_staging()`, production
   TAK disentuh (sama corak `stagingValid` check sedia ada di
   `ingest-production.js` baris ~210-222).
2. Kalau ID `rss_items_staging` carry-forward berlanggar dengan ID item
   fresh dari C tapi tunjuk `cluster_id` BERBEZA — fail closed, JANGAN agak.
3. `evaluateDestructiveRebuildGuard()` — SELEPAS carry-forward mekanisme ni
   wujud, `ingest-production.js` TAK LAGI panggil guard tu sebagai syarat
   block "ada personal data = block terus". Guard KEKAL wujud (kegunaan
   destructive lain jika perlu), cuma laluan ingestion normal tak
   bergantung padanya lagi — carry-forward + fail-closed check (poin 1/2 di
   atas) ialah mekanisme perlindungan baharu yang menggantikannya di sini.

### F. Bila personal reference tamat

Kitaran seterusnya: `expires_at` lepas → row dibersihkan (A) → story tu
bukan `protectedStoryIds` lagi → TAK carry-forward → hilang secara semula
jadi drpd live corpus (sama seperti sumber `disabled` sekarang). Tiada
jadual archive baharu, tiada cron tambahan.

## Audit tambahan (diminta ChatGPT) — laluan retrieval Saved/History

Carian repo: **tiada UI/endpoint pembaca (reader-facing) untuk Saved/History
ditemui** dalam pusingan carian ini (tiada komponen `SavedStories`/
`HistoryList` dsb di `ui/src/` — hanya jadual DB + adapter penulisan). Jadi
soalan "adakah carry-forward cluster `workspace_state='expired'` boleh
dibaca semula bila reader buka Saved/History" — **belum releven, sebab UI
tu sendiri belum wujud**. Dicatat sebagai *acceptance requirement masa
hadapan* (bila Saved/History reader UI dibina, laluan bacaannya MESTI
kecualikan penapisan `workspace_state` biasa untuk story yang ID-nya
dirujuk terus oleh `saved_stories`/`history_entries` milik pengguna tu) —
TIADA UI dicipta sekarang, ikut arahan eksplisit.

## Acceptance minimum (fixture/in-memory, BUKAN production)

- [ ] Tiada personal data → hasil ingestion sama seperti sekarang.
- [ ] Saved story masih ada dalam fresh corpus → tiada carry-forward pendua.
- [ ] Saved story hilang drpd fresh corpus → cluster+items dibawa, `expired`.
- [ ] History sahaja (tiada saved) turut melindungi story.
- [ ] Saved/history dah tamat → row dibersihkan (A), story TAK dibawa.
- [ ] Satu story dirujuk >1 baris (saved+history serentak) → carry-forward SEKALI sahaja.
- [ ] Protected story tiada langsung dalam live lama (data corrupt/tercicir) → ingestion fail closed.
- [ ] Perlanggaran ID item carry-forward vs fresh → ingestion fail closed.
- [ ] (#7/#8) `source_id` item carry-forward tiada dlm `sources_staging` → ingestion fail closed dgn mesej jelas, bukan FK error mentah.
- [ ] Semua protected ID ada dlm staging → swap diteruskan.
- [ ] Cerita carry-forward TAK muncul dlm query reader feed/ranking biasa (`workspace_state != 'expired'` filter sedia ada).
- [ ] (#11) Representative cluster carry-forward hilang/tak konsisten (tiada dlm item yg berjaya dibawa) → fail SEBELUM swap.
- [ ] (#12) Non-dry-run: cleanup row tamat (A) boleh KEKAL terpadam walau ingestion gagal selepas tu, tapi `sources`/`story_clusters`/`rss_items` LIVE mesti kekal TAK berubah sebab swap belum berlaku (cleanup A ialah write terus, bukan sebahagian transaksi staging).

## Skop TIDAK disentuh

- classifier/ranking (`buildRankedQueue`, `lab/engine.js`) — tiada perubahan.
- `evaluateDestructiveRebuildGuard()` fungsi itu sendiri — kekal wujud, tak
  dipadam, cuma laluan ingestion normal tak panggil dia lagi.
- Tiada Saved/History reader UI baharu.
- Tiada jadual/abstraction/service baharu — carry-forward tulis terus ke
  `story_clusters_staging`/`rss_items_staging` sedia ada.
