# Editorial Desk — Admin UX Simulation v1 (2026-08-15)

Status: `[x] Simulation` `[ ] Approved` — **no code, no UI, no picker, no Pin, no Boost**

FASA 4.3, per Izzat's own direct interjection in the ChatGPT thread
("adakah apa yg awak buat ni akan memudahkan admin atau
merumitkannya?... saya takut dah over engineering dan menyusahkan
admin yg sibuk") and ChatGPT's resulting course correction: before
any shared story picker is designed, simulate the actual admin
experience against the actual admin — Izzat, who is not a daily
newsroom editor. This document pauses `docs/editorial-story-selection-design-v1.md`'s
follow-on work (the picker implementation plan) to answer a prior
question: **does what FASA 4.3 has designed so far help Izzat, or add
a job he doesn't have time for?**

## The real user, restated precisely

Everything designed in `docs/editorial-desk-audit-v1.md` through
`docs/editorial-story-selection-design-v1.md` implicitly modeled the
admin as:

> "Saya editor berita yang sentiasa mengurus portal."

Izzat's own words in this thread say otherwise:

> "pilihan editor bukannya ada selalu. saya selalu admin takkan ada
> masa untuk pin berita setiap masa. saya mungkin hanya pin seminggu
> sekali. selebihnya saya biarkan sistem bergerak sendiri."

That is a different product shape:

> "Saya pemilik sistem yang sekali-sekala masuk untuk campur tangan
> bila ada sesuatu yang benar-benar penting."

Restated as a hard operating principle, per ChatGPT: Adjung Quick's
admin surface is not a CMS a newsroom staffs continuously — it's an
**AI editorial engine with occasional human intervention**. On any
given day, the overwhelmingly likely outcome of Izzat opening
`/admin` is: nothing needs him. The UI has to be honest about that,
not fill his screen with things to triage just because triage-shaped
UI is what admin panels conventionally look like.

> 95% masa → sistem bergerak sendiri
> 5% masa → manusia campur tangan pada perkara luar biasa
> UI mesti direka untuk 5% itu.

## Simulation 1 — Nothing needs Izzat

**Setup**: Izzat opens `/admin` after a week away. The system has been
running normally — classification working, no unusual failures, no
story urgently needing intervention.

**What the shell (as shipped in `editorial-desk-shell-implementation-plan-v1.md`)
actually shows him today**:

```
Editorial Desk
  Hari Ini
    Laporan Hari Ini
      Berita diproses: 470
      Perlu perhatian: 4 berita belum pasti bidang
      Tiada tindakan diperlukan: 466 berita
```

**Verdict, checked honestly against the real shipped digest**: this is
closer to the ideal than the worst case — the digest already leads
with "Tiada tindakan diperlukan: 466 berita" and states "Perlu
perhatian" as a small number, not a wall of raw queue items. But it
still surfaces "4 berita belum pasti bidang" as a number requiring
Izzat's attention-parsing even in a week where nothing is actually
urgent. Four low-confidence classifications in 470 processed stories
is normal system noise, not an event — the digest doesn't yet
distinguish "routine background noise" from "something you should
look at." **This is the shell's real gap, not a hypothetical one**:
it reorganized *where* information lives, but didn't yet answer
*whether a number this small is worth showing at all* on a normal
week.

**What "ideal" looks like, per ChatGPT's own sketch**, restated for
this project's actual data shape:

```
Editorial Desk

  Tiada tindakan diperlukan minggu ini.
  [Keluar]
```

**Open tension, named honestly rather than resolved**: today's Digest
already computes `needsAttention` (`AdminDigest.jsx`) — a genuine
zero-vs-nonzero signal exists. The question this simulation surfaces
is a threshold question, not a data question: at what `needsAttention`
count does "4 berita belum pasti bidang" stop being worth showing at
all versus quietly absorbed as routine noise the system handles on
its own (e.g. auto-classified on next ingest cycle, or simply
irrelevant because none of those 4 stories will ever be
pinned/boosted anyway)? This document does not set that threshold —
it names the question as the actual design decision Scenario 1
surfaces, deferred to whoever designs the Hari Ini section next.

## Simulation 2 — Izzat wants to pin one important story

**Setup**: a major news event happens ("Kerajaan umumkan keputusan
besar"). Izzat wants to make sure readers see it, regardless of what
the ranking engine currently scores it.

**Target, per ChatGPT's explicit budget**: no more than 5 clicks from
opening `/admin` to a confirmed Pin.

**Walking the actual path against today's shipped shell** (Pin doesn't
exist yet, so this traces the shell's navigation cost alone, which
any future Pin surface would be layered on top of):

1. Open `/admin` (already authenticated — 0 clicks, per
   `adminSupabase.js`'s persistent session)
2. Click "Keputusan Editorial" tab (1 click, per the shipped
   `DESK_SECTIONS` nav)
3. **Here the shell currently dead-ends** — "Pin" is a "belum
   tersedia" placeholder card, not a working entry point

**What a real Pin flow needs to fit inside 5 clicks total**, working
backward from the budget:

```
1. Buka Editorial Desk           (0 klik — auto, sesi berterusan)
2. Klik "Keputusan Editorial"    (1)
3. Klik "Pin berita baharu"      (2)
4. Pilih berita                  (3)
5. Klik "Pastikan muncul di atas"(4)
6. Sahkan                        (5)
```

This fits the budget **only if step 4 (picking the story) resolves in
a single click** — i.e. the story is already visible in a short list,
not behind a multi-step Bidang → filter → scroll path. This is the
central design consequence of Simulation 2: **whatever picker gets
built must assume the admin already knows roughly what they're
looking for** ("the government announcement from today") and let them
find it in one glance, not force them through the full field-taxonomy
navigation `docs/editorial-story-selection-design-v1.md`'s Model B
implies for a daily-editor user. For an occasional-intervention admin,
"berita penting minggu ini" (a short, recency-biased, cross-field
list) is a better single entry point than "pilih Bidang dahulu."

**Consequence for the deferred picker design**: this doesn't overturn
Model B's recommendation outright, but it reframes the picker's
*default* view — a short cross-field "recent + notable" list first,
with Bidang-filtered browsing as a secondary path for the rarer case
where the admin genuinely needs to narrow down. This is a real
adjustment to `docs/editorial-story-selection-design-v1.md`'s
recommendation, surfaced here rather than silently reversing that
document.

## Simulation 3 — Admin is not a journalist

**Setup**: test whether Izzat, without newsroom vocabulary, can use
Editorial Desk's existing surfaces unassisted.

Checked term by term, against what's actually shown today:

| Term | Where it appears today | Does Izzat need to understand it to act? |
|---|---|---|
| **Bidang** | Edition switcher, Review Queue, Digest | Yes, unavoidably — it's Adjung Quick's core content model (topic taxonomy), not admin jargon. Izzat already uses this term throughout this session's own conversation ("kalau mmg kurang berita dlm sesuatu bidang, better tutup dulu bidang tu") — this is a term he owns, not one imposed on him. |
| **Classification / status klasifikasi** | Review Queue's `displayReason` ("Sistem belum pasti bidang yang sesuai") | Already handled correctly — `ReviewQueueCard.jsx` never shows a raw "confidence: 0.62" value, only a plain-language sentence. This is the pattern to keep, not fix. |
| **Override** | Timeline, planned picker card metadata | Risk area — "override" is an internal/engineering term. What the Timeline already shows instead is the actual human action ("Berita disembunyikan," "Berita dipindahkan ke Nasional") — correct today. The picker's planned "override aktif" field (`docs/editorial-story-selection-design-v1.md` §1) must follow the same substitution: show *what already happened* to a story ("Sudah disembunyikan," "Sudah di-pin"), never the word "override" itself. |
| **Boost** | Currently a placeholder card only | Real risk, unresolved: "boost" as a raw label doesn't self-explain "raises the chance of selection, doesn't guarantee placement" (the honest contract `docs/editorial-desk-implementation-plan-v1.md` §2 already locked). The placeholder text shipped in the shell ("Berikan peluang lebih tinggi untuk dipaparkan... bukan dijamin tempat") gets this right in prose — the eventual working Boost surface must carry that same plain-language contract forward, not regress to a bare "Naikkan" button with no explanation once it's built for real. |
| **Pin** | Currently a placeholder card only | Low risk — "Pin" already reads as an ordinary-language verb ("pin" a message/post is common in consumer apps Izzat already uses, e.g. Telegram's own pinned messages), and the shell's placeholder copy already states the real-world effect plainly. |

**Verdict**: Bidang and Classification are already handled honestly.
Override is a naming risk in the *planned* picker, not yet built —
flagged before it ships, not after. Boost's plain-language contract
exists today only in a placeholder; it must survive into the real
surface. Pin is low-risk as a term but has zero real surface yet to
evaluate against actual use.

## What this simulation found, summarized

1. **The shipped shell's Hari Ini is closer to right than wrong**, but
   doesn't yet distinguish routine noise from genuine signal — a real
   open question for whoever designs Hari Ini's threshold logic next,
   not a flaw introduced by this simulation.
2. **A 5-click Pin flow is achievable**, but only if the future picker
   defaults to a short "berita penting/terkini" list rather than
   forcing Bidang-first navigation — this measurably updates
   `docs/editorial-story-selection-design-v1.md`'s recommended default
   view, not just a stylistic preference.
3. **Jargon risk is concentrated in "override" and "boost"**, not
   "Bidang" or "Pin" — both already-shipped surfaces (Review Queue,
   Timeline) already avoid the trap correctly; the risk is specifically
   in *not yet built* surfaces carrying that discipline forward.
4. **No evidence found that today's shell actively over-engineers** —
   the risk Izzat named is real and worth guarding against going
   forward (the picker, Pin, and Boost are exactly where it could
   still happen), but the shipped shell itself does not exhibit it.

## What this document does NOT do

- No code, no component, no route
- No picker design, no Pin implementation, no Boost implementation
- Does not set the Hari Ini "worth showing" threshold named in
  Simulation 1 — named as an open question, not decided
- Does not finalize the picker's default view — proposes an
  adjustment to `docs/editorial-story-selection-design-v1.md`'s
  recommendation, does not overwrite that document
- Does not resolve whether "override" terminology needs a broader
  audit across the codebase — flagged for the picker specifically,
  not a general sweep

## Next

Awaiting review. Per ChatGPT's explicit instruction: no picker
implementation plan, no Pin, no Boost work begins until this
simulation is reviewed and Izzat's over-engineering concern is
directly answered.
