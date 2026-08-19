# Polish 6 — Closeout (2026-08-19)

Ditulis selepas ChatGPT (director) mengesahkan Polish 6B.1 CLOSED berdasarkan
real production swap + verification penuh (bukan fixture/dry-run sahaja).
Dengan 6A, 6B-a, 6B-b turut lulus sebelum ini, keseluruhan Polish 6 ditutup.

## Sub-fasa

- **6A** — Admin Sumber: tambah/ubah/aktif-nyahaktif sumber, permission/RLS
  diuji production. Rekod ujian palsu (`__adjung_polish6a_insert_smoke__`)
  dipadam.
- **6B-a + 6B-b** — `status_reason` (sebab nyahaktif) disimpan+dipaparkan,
  dikosongkan bila aktif semula; amaran nyahaktif jujur (berita lama akan
  hilang paparan pada kemas kini seterusnya); swap-security dibaiki supaya
  RLS/polisi/GRANT Admin tak hilang selepas `sources_staging` -> `sources`.
- **6B.1** — Carry-forward personal state (saved/history) supaya story yang
  dirujuk pengguna tapi hilang daripada corpus segar tak jadi dangling FK
  bila `*_old` di-drop. Ditanda `workspace_state='expired'`.

## 6B.1 — bukti real swap (bukan cuma fixture/dry-run)

Real production ingestion (non-dry-run) dijalankan 2026-08-19, selepas dua
pusingan pembetulan ChatGPT (pagination protected-ID/carry-forward reads,
mirror Source Registry lengkap) dan satu semakan kod bebas 4-sudut (20 ejen)
yang mencari+membetulkan 3 bug sebenar (2 kritikal, 1 sederhana) sebelum
dibawa kepada ChatGPT.

- Swap committed: 686 cluster, 741 item — padan TEPAT dengan
  `expectedClusterCount`/`expectedItemCount` (fresh + carry-forward=0, sebab
  `saved_stories`/`history_entries` masih kosong pre-launch).
- Top score (excl. `workspace_state='expired'`) Lab=90, Supabase=90 — padan.
- Tiada PARITY FAILED.
- Source Registry integrity: 43 sumber (padan pra/pasca-swap).
  `created_at`/`updated_at`/`coverage`/`last_success_at`/`last_failure_at`/
  `last_failure_reason` disahkan SAMA TEPAT (bukan direset) pada 3 sampel.
- Swap-security 6B-a diuji SEBENAR guna JWT admin `authenticated` (bukan
  `service_role`) — PATCH terus ke `/rest/v1/sources` macam Admin UI buat:
  nyahaktifkan sumber `rss-amanz` + sebab -> 200, sebab tersimpan; aktifkan
  semula -> 200, sebab dikosongkan; dipulihkan tepat ke keadaan asal.
  Membuktikan RLS/polisi/GRANT yang dibina dalam `reset_ingestion_staging()`
  benar-benar terbawa bila `sources_staging` -> `sources` melalui swap
  SEBENAR, bukan cuma dry-run/teori.
- Reader/Admin smoke test: halaman awam papar berita baharu, `/admin` buka,
  menu Sumber muat data, tiada ralat permission baharu.

Carry-forward sebenar (bukan fixture) belum diuji end-to-end kerana
`saved_stories`/`history_entries` masih kosong pre-launch — ChatGPT nyatakan
ini TIDAK menghalang penutupan 6B.1 (behavior sudah diuji melalui 21/21
fixture suite, `db/carry-forward-personal-state.test.mjs`); jangan cipta
data pengguna palsu production semata-mata untuk memaksa laluan carry-forward
sebelum ada pembaca sebenar.

## `*_old` — status semasa (SENGAJA belum dibuang)

Swap 2026-08-19 menghasilkan satu set `*_old` baharu (rollback set). Per
arahan eksplisit ChatGPT: **jangan buang secara autonomi** walaupun semua
verification lulus — DROP tak boleh diundur, tak mendesak, dan `*_old` ini
satu-satunya laluan rollback sehingga Izzat sendiri beri persetujuan ringkas
untuk housekeeping. Ia tidak mengganggu production semasa; kesan tunggal
ialah kitaran ingestion production SETERUSNYA akan ditolak (per reka bentuk
`swap_ingestion_staging()`) sehingga `*_old` ni dibuang dahulu via
`db/drop-ingestion-old-tables.mjs` (checklist automatik +
`CONFIRM_OLD_TABLES_VERIFIED=true`, memerlukan pengesahan manusia).

## Seterusnya

Polish 7 — Mature Scoring V1 (per ChatGPT): fokus pertama isu permission
`public_active_overrides`, kemudian audit + kalibrasi skor sebenar
berdasarkan corpus production — TANPA ubah classification/selection secara
sembarangan. Edisi global (en-global/ar-global) belum masuk fasa polish —
infrastruktur (taxonomy, classification per-edisi) sudah wujud tapi itu
persediaan, bukan fasa aktif. Urutan penuh (per ChatGPT): Polish 7 (skor) ->
Polish 8 (satukan Nilai/Pemilihan 10/Susunan Akhir) -> Polish 9 (struktur
produk/settings/robustness) -> Polish 10 (UAT akhir) -> 5 sesi simulasi
penuh -> edisi global sebagai fasa berasingan.
