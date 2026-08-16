# Semakan Forensik Expiry Editorial V1

**Tarikh:** 16 Ogos 2026  
**Kaedah:** read-only. Semakan checkout `adjung-quick` pada `main`, schema SQL, migrasi expiry, reader/writer aplikasi, resolver, panggilan UI, dan ujian/dokumen bukti sedia ada.  
**Tiada kod, skema, migrasi, ujian, atau data diubah.**

## Keputusan

**Pin editorial memang wujud dalam model data ini.** Ia ialah baris `story_overrides` dengan
`override_type = 'pin'`, mempunyai `expires_at`, dan reader hanya menerima override yang masih
aktif serta belum luput.

Ini berasingan daripada lifecycle kandungan. Dalam checkout ini, tiada `scheduledExpiresAt` atau
mekanisme jadual luput kandungan seperti yang ditemui dalam repositori lain.

## Bukti per soalan

### 1. Adakah Pin benar-benar disimpan dalam `story_overrides`?

**Ya.** `db/schema-editorial-state.sql` mencipta `story_overrides` dengan:

- `story_id` dan `edition_id` sebagai skop;
- `override_type` yang `CHECK`-nya membenarkan `pin`;
- `new_field`, `reason`, `created_by`, `created_at`, `expires_at`, dan `active`.

Write path ialah `submitPinOverride()` dalam `ui/src/admin/reviewQueueAdapter.js`. Ia menyemak
bidang, menolak pin apabila hide masih aktif, menghadkan dua pin aktif bagi setiap
`(edition_id, new_field)`, lalu memanggil `writeOverride()` dengan `overrideType: 'pin'`.

### 2. Adakah Pin mempunyai `expires_at` 24 jam?

**Ya, pada write path pangkalan data.** `db/schema-fix-server-side-expiry.sql` memasang trigger
`BEFORE INSERT` `story_overrides_set_expiry_trg`. Fungsinya menulis tanpa syarat:

```sql
NEW.expires_at := now() + CASE NEW.override_type
  WHEN 'pin' THEN interval '24 hours'
  ELSE interval '7 days'
END;
```

Klien tidak menghantar `expires_at`; `writeOverride()` hanya menghantar identiti keputusan dan
sebab. Ini bermakna jam PostgreSQL yang menentukan tamat, bukan jam pelayar. Dokumen
`docs/pin-implementation-plan-v1.md` juga merekodkan pengesahan production terdahulu bahawa
nilai 30 hari yang dipalsukan telah ditulis semula kepada 24 jam.

### 3. Adakah `expires_at` dibaca untuk menentukan Pin masih aktif?

**Ya. Dua lapisan pembacaan menguatkuasakannya.**

1. `db/schema-public-active-overrides-view.sql` mentakrifkan `public_active_overrides` sebagai
   `active = true AND (expires_at IS NULL OR expires_at > now())`.
2. `ui/src/adapter/productionAdapter.js` membaca view itu, mengumpulkan override mengikut cerita,
   kemudian menghantarnya ke `resolveStoryField()`.

`resolveStoryField()` memberi precedence `hide → pin → reclassify → classifier`. Pin yang tamat
tidak sampai ke resolver kerana ia sudah ditapis oleh view.

Admin path juga jelas tentang expiry: `fetchReviewQueue()` dan pengawal hide/pin dalam
`reviewQueueAdapter.js` menapis dengan `.gt('expires_at', new Date().toISOString())`.

### 4. Adakah `scheduledExpiresAt` berkaitan dengan Pin atau lifecycle kandungan sahaja?

**Ia tidak wujud dalam checkout ini.** Carian seluruh sumber tidak menemui `scheduledExpiresAt`,
`scheduled_expires_at`, atau mekanisme jadual luput kandungan. Ia adalah konsep daripada
repositori yang tersalah diperiksa sebelum ini, bukan sebahagian daripada `adjung-quick`.

### 5. Adakah mana-mana code path menghasilkan konsep “Pin akan tamat”?

**Ya, pada tahap data dan reader; belum pada tahap UI Pin.**

- `expires_at` pada row pin ialah fakta yang cukup untuk derived signal `pin_expiring`.
- Reader menguatkuasakan tamat melalui `public_active_overrides`.
- `ui/src/admin/editorialActivityAdapter.js` pun sudah mengira event derived `expired` setelah
  `expires_at` berlalu.
- Tetapi `submitPinOverride()` tidak mempunyai caller UI. Audit dan closure docs menyatakan
  pin belum ada permukaan Editorial Desk. Jadi codebase belum mempunyai UI yang secara literal
  memaparkan ayat “Pin akan tamat esok”.

### 6. Bezakan lifecycle Pin dan lifecycle kandungan

| Dimensi | Pin editorial (wujud) | Jadual luput kandungan |
| --- | --- | --- |
| Rekod | `story_overrides` | Tidak wujud dalam checkout ini |
| Pemicu tamat | Trigger PostgreSQL pada INSERT | Tiada |
| Tempoh | 24 jam untuk `pin` | Tiada |
| Kesan selepas tamat | Tidak lagi muncul daripada `public_active_overrides`; cerita kembali kepada state resolver seterusnya | Tiada |
| Audit | Row dikekalkan; ia bukan delete | Tiada |
| Status UI | Backend/write path siap, tiada caller UI pin | Tidak relevan |

## Status tepat untuk Attention Layer

Signal `pin_expiring` kini disahkan sah sebagai **derived computation** daripada:

```text
story_overrides
  WHERE override_type = 'pin'
    AND active = true
    AND expires_at > now()
```

Ia mesti dibezakan daripada dua perkara:

- pin yang telah luput (yang tidak lagi memberi kesan kepada pembaca); dan
- lifecycle atau retention lain seperti `story_clusters.expires_at`, `review_expires_at`,
  `saved_stories.expires_at`, serta `history_entries.expires_at`.

Implementasi Attention Layer masih belum dibuat.
