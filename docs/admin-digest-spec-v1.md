# Admin Digest Spec v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

Category: **[DECISION] spec. No digest generator or delivery mechanism
built here.** Fasa 3.5 — per ChatGPT, the component that most directly
answers Izzat's actual stated need: *"saya sibuk utk pantau kerja awak
satu-satu."* The Digest is what lets the admin NOT watch continuously.

## Content — leads with what needs attention, ends with reassurance

Format locked in `docs/editorial-operations-mvp-plan-v2.md` §3, restated
as a concrete template:

```
Laporan Hari Ini — [tarikh]

[N] berita diproses.

Perkara yang perlu perhatian:
• [count] berita tidak pasti bidang
• [count] sumber gagal diambil
• [count] berita perlu semakan editor

Tiada tindakan diperlukan: [N minus flagged] berita.
```

**If nothing needs attention**, the digest still sends, shortened:

```
Laporan Hari Ini — [tarikh]

[N] berita diproses. Tiada apa-apa perlu perhatian awak hari ini.
```

This second case matters as much as the first — per the v2 plan's
design rule, the admin's default state should be *not reading detail*.
A digest that only appears when something's wrong would make silence
ambiguous (did nothing happen, or did the digest itself fail?);
sending every time, sometimes short, keeps "I got today's digest" a
reliable signal on its own.

## Data source — reuses existing tooling, no new detection

| Digest line | Computed by |
|---|---|
| "[N] berita diproses" | `db/daily-observation.mjs`'s pipeline counts |
| "berita tidak pasti bidang" | `db/classification-observatory.mjs`'s low-confidence + unclassified counts |
| "sumber gagal diambil" | `db/daily-observation.mjs`'s silent-source alert logic (already distinguishes real failures from known-broken sources, per its own existing design) |
| "berita perlu semakan editor" | Review Queue's own current entry count (`docs/review-queue-spec-v1.md`) |

Same principle as the Review Queue: **the Digest is a presentation
layer, not a new analysis engine.** Every number it shows is already
computed by a script that exists and runs today.

## Frequency and delivery — deliberately minimal for v1

**Frequency: daily**, tied to whenever `db/daily-observation.mjs` /
`db/classification-observatory.mjs` are actually run. Not real-time —
matches the existing observation cadence
(`docs/post-launch-monitoring-plan-v1.md`), not a new schedule.

**Delivery: in-app only for v1** — the admin sees it when they open the
admin view, not pushed via email/SMS/notification. Reasoning: this
project has no scheduled/automated job infrastructure yet
(`docs/production-data-lifecycle-v2-design.md`'s refresh strategy still
manual) — building push delivery before the underlying data pipeline is
itself scheduled would be building on an unfinished foundation.
**Explicitly deferred, not rejected** — worth revisiting once
`docs/ingestion-lifecycle-v2-design.md`'s scheduled pipeline exists.

## What counts as "needs attention" — thresholds, not raw counts

Per `db/daily-observation.mjs`'s own existing alert design (already
built, this session): the Digest reuses those same thresholds, not new
ones. A single low-confidence story doesn't count as "needs attention"
if it's within normal daily variance — the Digest inherits whatever
`db/daily-observation.mjs` already decided crosses the line into a real
alert, rather than re-deciding sensitivity from scratch.

## What this spec does NOT do

- Does not build any digest-generation script or admin UI
- Does not implement scheduling/automation for when the digest is
  produced
- Does not implement push delivery (explicitly deferred, see above)
- Does not define new alert thresholds — inherits
  `db/daily-observation.mjs`'s existing ones
