# Roadmap to Production v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Phases from post-launch v1.0 (MVP) to a genuinely mature production
product. Drafted by Claude, **revised by ChatGPT** — its three
corrections to the original 5-phase draft are recorded in §"What
changed" at the bottom, since the reasoning matters more than the
result.

The organizing principle (agreed): *fix what the reader sees → give the
system a human control layer → make it able to look after itself →
raise its intelligence → grow the audience.*

---

## FASA 1 — Observation & Stabilization
**Sekarang → 2 minggu**

**Soalan:** Adakah apa yang baru di-launch ini betul-betul stabil?

- Daily snapshot (`db/snapshot-production.mjs`)
- Field distribution per Bidang, per edition
- Source health — mana yang gagal fetch, mana yang senyap
- False positive / false negative tracking
- **Fix hanya bug yang jejas pembaca** — tiada perubahan lain

**Output:** Production Evidence Baseline v1 — data 7–14 hari yang jadi
asas setiap keputusan Fasa 2.

**Kenapa dahulu:** Semua keputusan tertangguh (Field Visibility, RTM
audit, ranking expansion) perlukan data sebenar. Bukti konkrit kenapa:
Kesihatan berubah 1 → 0 dalam hari yang sama (false positive HTML), jadi
snapshot sehari terbukti tidak boleh dipercayai sebagai asas keputusan.

---

## FASA 2 — Editorial Correctness
**Minggu 3–6 (realistik: 1–2 bulan)**

**Soalan:** Adakah kandungan yang pembaca nampak itu BETUL?

**2.1 Field Visibility Policy** — kunci VISIBLE/QUIET/HIDDEN guna data
Fasa 1, termasuk kes khas Bencana (QUIET biasa, VISIBLE segera bila ada
peristiwa besar). Rangka kerja sedia ada:
`docs/field-visibility-policy-v1.md`, `docs/field-visibility-evaluation-v1.md`.

**2.2 Source Precision Audit** — RTM Category Feed Mismatch dan
mana-mana sumber lain yang silap kategori (`docs/known-issues.md` §3).

**2.3 Classification Calibration** — baki field yang data Fasa 1 tunjuk
gap konsisten (bukan gap sehari).

**2.4 Editorial Override Design** ← *ditambah oleh ChatGPT*
Sebelum bina apa-apa dashboard, jawab dulu soalan asas:

> **"Kalau editor tidak setuju dengan keputusan AI, apa jalan keluar?"**

Skop yang perlu ada jawapan: override classification, hide story,
promote story, suppress source. Ini **reka bentuk sahaja** pada fasa
ini — implementasi di Fasa 3.

**Kenapa sebelum growth:** Tak guna tarik pembaca kalau kandungan salah
kategori atau Bidang separuh kosong. Kepercayaan pembaca susah dipulih.

---

## FASA 3 — Editorial Operations MVP
**Bulan 2–4 (realistik: 2–3 bulan)**

**Soalan:** Siapa yang mengawal editorial bila sistem buat keputusan?

Ini fasa yang **tiada langsung** dalam draf asal — dan ChatGPT nilai ia
sebagai jurang terbesar antara "engine" dan "platform".

Keadaan sekarang:
```
RSS → AI → Reader          (tiada manusia dalam aliran)
```

Sasaran:
```
RSS → AI Processing → Editorial Desk → Reader
```

Komponen:
- **Admin** — login, roles
- **Editorial Dashboard** — incoming stories, confidence, source, field
- **Review Queue** — approve / reject / override
- **Priority Control** — pin / boost / suppress

**Kenapa di sini, bukan lewat:** Inilah komponen yang menjadikan Adjung
Quick sebuah *produk editorial*, bukan sekadar RSS aggregator berAI.
Diletakkan **sebelum** automasi, sebab automasi tanpa kawalan manusia
hanya mempercepatkan keputusan yang tiada siapa boleh betulkan.

---

## FASA 4 — Operational Reliability
**Bulan 3–5 (realistik: 2–3 bulan)**

**Soalan:** Kalau sistem rosak, adakah kita TAHU, dan boleh PULIH?

Draf asal letak ketiga-tiga ini serentak sebagai satu pakej. ChatGPT
pecahkan — terlalu besar untuk satu langkah, dan urutannya penting:

**4.1 Monitoring** (dahulu) — RSS failure, classification drop, empty
fields, ranking anomaly. Rangka kerja:
`docs/post-launch-monitoring-plan-v1.md`.

**4.2 Scheduled Pipeline** (kemudian) — ingestion, classification,
ranking refresh jadi automatik.

**4.3 Backup & Recovery** (kemudian) — Supabase Pro + restore rehearsal
sebenar (`docs/restore-rehearsal-v1.md`,
`docs/production-safety-decision-proposal-v1.md`).

> **Sebab urutan ini:** *Automasi tanpa observability boleh
> mempercepatkan kesilapan.* Kena boleh nampak keadaan sistem DULU,
> sebelum benarkan ia berjalan sendiri.

Nota: 4.2 (automasi) ialah Trigger C, dan ia yang menjadikan 4.3 wajib
— sebab lepas automasi, tiada manusia perhati setiap run.

---

## FASA 5 — Editorial Intelligence
**Bulan 5–8 (realistik: 2–3 bulan)**

**Soalan:** Adakah ranking mencerminkan nilai editorial sebenar Adjung?

**5.1 Ranking Expansion** — dari `ms-MY.Politik` ke field lain, satu
demi satu, guna shadow mode + benchmark + manual review (proses yang
sama seperti pilot asal).

**5.2 Editorial Value Dimension** — cara nilai berita bernilai kekal vs
trend semata-mata (`docs/editorial-value-dimension-discovery.md`).

> ChatGPT: *"Jangan tergesa. Ini mungkin membezakan Adjung daripada
> portal biasa."*

**Kenapa lewat:** Ranking canggih atas pipeline tak stabil = bangunan
cantik atas tanah lembik.

---

## FASA 6 — Real Readers & Public Growth
**Bulan 6+ — tetapi boleh bermula sebaik Fasa 3 minimum selesai**

Di sinilah ChatGPT paling tidak setuju dengan draf asal: **jangan tunggu
semua siap baru jemput orang.**

**6.1 Closed Beta** — beberapa pembaca sahaja, feedback manual. Boleh
bermula awal, sebaik Editorial Operations asas (Fasa 3) siap.

**6.2 Analytics ringan** — Vercel Analytics percuma (Trigger A perlukan
cara ukur trafik).

**6.3 Identity Layer** — bila sudah ada sebab sebenar: bookmark,
history, personalization (Trigger B — amaran automatik sudah wujud
dalam `db/snapshot-production.mjs`).

**6.4 Public Launch** — barulah di hujung.

---

## Roadmap akhir

```
FASA 1  Observation & Stabilization
   ↓
FASA 2  Editorial Correctness
   ↓
FASA 3  Editorial Operations MVP
   ↓
FASA 4  Operational Reliability
   ↓
FASA 5  Editorial Intelligence
   ↓
FASA 6  Readers & Growth        (6.1 boleh mula selepas Fasa 3)
```

## What changed — ChatGPT's three corrections to the original draft

| Perkara | Keputusan |
|---|---|
| Observation dahulu | Kekal |
| Field Visibility | Kekal |
| RTM audit | Kekal |
| **Admin/editor workflow** | **Ditambah sebagai fasa sendiri (Fasa 3)** — jurang terbesar antara engine dan platform |
| **Automasi** | **Dilambatkan sedikit**, dipecah kepada monitoring → pipeline → backup |
| Ranking expansion | Kekal lewat |
| **Analytics** | **Diawalkan sedikit** ke dalam beta |
| **Real users** | **Jangan tunggu terlalu lama** — closed beta selepas Fasa 3, bukan di hujung sekali |

## Nota tentang timeline

Anggaran asal dinilai ChatGPT sebagai **sedikit optimistic**. Anggaran
lebih realistik sudah diguna pakai dalam dokumen ini (Fasa 2: 1–2 bulan,
Fasa 3: 2–3 bulan, Fasa 4: 2–3 bulan, Fasa 5: 2–3 bulan, Fasa 6:
berterusan).

> ChatGPT: *"ini bukan kerana coding sahaja. Halangan terbesar ialah
> keputusan editorial dan operasi."*

Iaitu: yang perlahankan projek ini bukan kelajuan menulis kod, tetapi
kelajuan membuat keputusan editorial — sesuatu yang memang memerlukan
masa dan data sebenar, bukan sesuatu yang boleh dipercepatkan dengan
menambah usaha teknikal.
