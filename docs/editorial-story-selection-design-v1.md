# Editorial Story Selection — Design v1 (2026-08-15)

Status: `[x] Design` `[ ] Approved` — **no code, no UI, no Pin, no Boost**

FASA 4.3, per ChatGPT's instruction, after the Editorial Desk shell
shipped: the shell reorganized existing surfaces but built no way for
an editor to reach a story that isn't already flagged by the Review
Queue. Pin and Boost both need "which story am I acting on?", and
per the implementation plan (`docs/editorial-desk-implementation-plan-v1.md`
§3) and the audit before it, the Review Queue is structurally the
wrong answer — it surfaces classification *problems*, not the
correctly-classified stories Pin/Boost apply to. This document answers
that question, and only that question.

## The question

> Bagaimana editor memilih berita yang hendak dikenakan tindakan
> editorial (Pin/Boost)?

## Four models compared

### Model A — Active Set Browser

Editor sees exactly what a reader currently sees for a given
(edition, field): the live 10-slot Active Set.

| | |
|---|---|
| **Kelebihan** | Paling mudah difahami — editor melihat apa yang pembaca lihat, tiada abstraksi tambahan. Tidak perlu query baharu — Active Set sudah dikira setiap kali. |
| **Risiko** | Hanya mendedahkan berita yang *sudah berjaya* masuk Active Set. Ini menolak Pin's paling bernilai use-case: menaikkan berita **rendah-ranking tapi penting** (contoh audit's sendiri: berita keselamatan awam yang tidak masuk Active Set atas skor semasa). Menggunakan Active Set Browser sebagai satu-satunya sumber pemilihan bermaksud Pin tidak boleh menyelesaikan masalah ia direka untuk selesaikan. |

### Model B — Recent Stories per Field

Browse `edition_story_classifications` (or `story_clusters` joined to
its current field) filtered by field, most recent first — the same
query shape `fetchReviewQueue` already uses, minus the low-confidence
filter.

| | |
|---|---|
| **Kelebihan** | Selari dengan konsep Bidang yang editor sudah faham (sama struktur macam Semakan). Query sederhana, reuse pattern sedia ada. Sesuai untuk admin bukan wartawan — tiada input bebas, hanya navigasi senarai. Skop terhad secara semula jadi (satu bidang pada satu masa), so it doesn't overwhelm. |
| **Risiko** | "Recent" perlu definisi eksplisit (ingest time? publish time?) — arbitrary tapi bukan blocker. Tidak boleh cari berita lama/spesifik di luar tetingkap "recent" tanpa scroll jauh. |

### Model C — Search

Free-text search over `story_clusters`/`rss_items` titles.

| | |
|---|---|
| **Kelebihan** | Paling fleksibel — cari terus apa yang editor ingat tanpa navigasi bidang. |
| **Risiko** | Search ialah keupayaan besar yang projek ini tidak ada di mana-mana pun (bukan admin, bukan reader-facing). Membina ini bermaksud membina infrastruktur carian (index, ranking-relevance, UI carian) semata-mata untuk satu use-case kecil. Risiko "jarum dalam jerami" — editor cari tajuk lama yang mereka ingat separuh, hasil tidak tepat, masa terbuang. Skop paling besar dalam kesemua 4 model, paling jauh daripada prinsip minimal projek ini. |

### Model D — All `story_clusters`

Browse every cluster, no filter.

| | |
|---|---|
| **Kelebihan** | Paling lengkap — tiada berita tertinggal. |
| **Risiko** | Tidak scale — sesi ingest sebenar projek ini sendiri (877–896 cluster setiap kitaran, per FASA 4.2's real production runs) menjadikan senarai tanpa penapis ini sebagai timbunan yang mustahil ditatang secara manual. Bertentangan terus dengan prinsip Adjung Quick yang minimal (`docs/adjung-quick-v1-spec.md`'s consumer-facing minimalism extends to admin tooling too, per the product spec's own framing). |

## Recommendation

**Model B (Recent Stories per Field) as the primary/default view.**

Reasoning: it is the only model that is simultaneously (a) small
enough to build without inventing new infrastructure, (b) matches how
an editor already thinks (they work in "Bidang" today via the Review
Queue and Active Set), and (c) reuses a query shape this project
already trusts. Model A remains valuable but only as a *secondary*
view (see below) — never the only path, since it structurally
excludes Pin's core use-case. Model C is not proposed for V1 — it is
a real future capability, not ruled out, but disproportionate to this
feature's actual need. Model D is rejected outright — it fails at
realistic production volume.

**Not decided here, flagged as a genuinely open sub-question**: should
the picker offer *both* Model A and Model B as tabs/toggles within the
same picker component (Active Set view for "what's live now", Field
List view for "everything in this Bidang")? This would directly serve
Pin's two real use-cases — promoting something already succeeding
(Active Set makes that visible) and rescuing something that should be
succeeding but isn't (Model B is the only view that can surface that).
This is a UI-detail decision for whoever builds the picker, not
something this design document locks — naming it here so it isn't
lost.

## 1. Minimum information per story

Per ChatGPT's explicit instruction: don't expose internal metadata
that would confuse an editor. The picker shows, per story:

- **Tajuk** — the story's current title
- **Sumber** — source name (matches Review Queue's existing
  `entry.sourceName` pattern)
- **Masa** — when the story was ingested/last updated (matches
  "recent" ordering, gives the editor a sense of freshness)
- **Bidang semasa** — the field it's currently classified under (or
  an explicit "Belum diklasifikasi" state — see §2)
- **Status klasifikasi** — whether it's confidently classified,
  low-confidence, or unclassified (reuses the same signal
  `fetchReviewQueue` already computes for `displayReason`)
- **Override sedia ada** — if the story already has an active
  hide/reclassify/boost/pin override, show which one. This prevents
  an editor unknowingly stacking a second Pin on a story that's
  already hidden (the backend's no-hide-conflict guard would refuse
  it anyway, per `docs/editorial-desk-audit-v1.md` §3 — but the UI
  should show this *before* the attempt, not just react to the
  rejection, per the same audit's finding on Pin's guards)

**Explicitly not shown**: raw classification confidence scores, raw
ranking-engine internals, or any field an editor would need database
knowledge to interpret. This mirrors `ReviewQueueCard.jsx`'s existing
`displayReason` pattern — a human sentence, not a number.

## 2. How unclassified stories are handled

Two capabilities have genuinely different relationships to
classification:

- **Pin can apply to a story with no field at all.** Per
  `submitPinOverride`'s design (`docs/editorial-desk-implementation-plan-v1.md`
  §2, confirmed against `reviewQueueAdapter.js:274`), pinning reuses
  `new_field` — meaning a Pin action *assigns* a field as part of the
  same action. This is the exact mechanism that already lets a
  reclassify override rescue an unclassified story
  (`state/pin.test.mjs`'s "pin on an unclassified story" case). So an
  unclassified story is a **valid Pin target** — the picker should not
  hide it.
- **Boost cannot apply to a story with no field**, because Boost's
  entire contract (`boostAvailable(edition, field)`) is keyed on a
  field that's already gated into `editorial_v1`. An unclassified
  story has no field to check that gate against.

**Consequence for the picker**: unclassified stories appear in the
picker (likely under an explicit "Belum diklasifikasi" grouping
distinct from the per-field lists), but the picker's action-availability
logic must know the difference — offering Pin on an unclassified story
is valid, offering Boost on one is not, using the exact same
`boostAvailable` contract the shell's Keputusan Editorial placeholder
already promises to honor once built. **Do not conflate the two** —
per ChatGPT's explicit instruction.

## 3. Permission boundary

**No new role.** Restated from the product spec (`docs/editorial-desk-product-spec-v1.md`
§5) and the audit (§1) — this document does not reopen that boundary.

The picker itself has no permission logic of its own: it shows the
same stories to any signed-in editor/admin (matching how Review Queue
and Active Set data are already visible to any editor today — nothing
in the current codebase filters *visibility* of stories by role, only
*actions* are role-gated). What differs by role is which actions the
picker offers once a story is selected:

- **Editor**: can open Boost (where `boostAvailable` is true) —
  cannot open Pin (`ADMIN_ONLY_ACTIONS` already includes `'pin'`,
  `db/editor-auth.mjs:45`)
- **Admin**: can open both Pin and Boost

This is a direct carry-forward of `canPerformAction`'s existing
enforcement — the picker doesn't introduce a new check, it just needs
to consult the same one before rendering an action affordance next to
a selected story.

## 4. Verification requirement

Per ChatGPT's explicit instruction, restating the FASA 3 lesson named
in the implementation plan (§4) — proving the picker exists and shows
cards is not sufficient. The chain that must actually be demonstrated,
once a picker + Pin/Boost surface are built on top of this design:

```
Berita dipilih (picker menunjukkan story yang betul, dengan
metadata yang betul — tajuk, bidang, status override)
    ↓
Tindakan editorial dibuat (Pin/Boost dipanggil dengan story_id yang
betul — bukan story_id yang salah kerana index/key mismatch dalam
senarai)
    ↓
Row database ditulis (story_overrides insert disahkan terus via query,
bukan hanya "UI menunjukkan kejayaan")
    ↓
Kesan pembaca (Active Set/reader app benar-benar berubah akibat
tindakan ini — bukan hanya row wujud dalam pangkalan data)
```

This applies to whatever picker implementation follows this design —
named here as a requirement the eventual implementation plan must
satisfy, not something this design document itself proves.

## What this document does NOT do

- No code, no component, no route
- No Pin implementation, no Boost implementation
- Does not decide whether Model A (Active Set) ships alongside Model B
  as a secondary view, or is deferred entirely — named as an open
  sub-question, not resolved
- Does not choose between building the Pin Surface directly vs.
  building a shared story-picker component first — per ChatGPT's
  explicit instruction, that choice comes only after this document is
  reviewed

## Next

Awaiting review. Per ChatGPT: after this document is approved, decide
whether to build the Pin Surface directly or build a shared story
picker component first (ChatGPT's own lean is toward the shared
component, but explicitly not locked before this design is reviewed).
