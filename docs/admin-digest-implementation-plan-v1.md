# Admin Digest Implementation Plan v1 (2026-08-13)

Status: `[x] Observation` `[x] Decision needed` `[ ] Implementation pending` `[ ] Closed`

FASA 3.6.4. Per ChatGPT: in-app only, human-first, reuse existing
signals, **no new detection engine**, only what needs attention.

## The problem it solves

Izzat's own words, the constraint that shaped all of Fasa 3:

> "Saya sibuk untuk pantau kerja awak satu-satu."

Fasa 3 gave the admin power to change the system. The digest changes
*who does the looking*:

```
Admin goes hunting for problems   →   System says what matters
```

## 1. Source data — and an honest architectural constraint

ChatGPT's instruction is "jangan cipta sistem parallel" — reuse
`daily-observation.mjs`, `classification-observatory.mjs`, and editorial
override data.

**Real constraint found by reading them**: both are Node CLI scripts
that authenticate with `SUPABASE_SERVICE_ROLE_KEY` and write to disk.
Neither can execute in a browser, and the service-role key must never
reach client code. So the digest cannot import and run that code.

**What "no parallel system" therefore means here** — and this is the
important distinction: the digest must not invent *new detection rules
or thresholds*. It reuses the same **definitions and queries**, at the
same numbers, so the digest and the CLI reports can never disagree about
what counts as a problem.

Strongest reuse available, and the plan's core: the Review Queue's own
`fetchReviewQueue()` **already** computes "needs attention" from
`edition_story_classifications`, with the same `< 0.5` confidence
threshold `classification-observatory.mjs` uses. The digest calls that
exact function. Not a copy — the same code path.

| Digest line | Source | New detection? |
|---|---|---|
| Berita diproses | `edition_story_classifications` count for the edition | No |
| Perlu perhatian | `fetchReviewQueue()` — the same function the queue uses | **No — literally the same code** |
| Tindakan editorial | `story_overrides` rows created today | No |
| Tiada tindakan diperlukan | processed − needs attention | No |

Silent-source detection is deliberately **excluded from v1**: it depends
on `lab/sources.js`'s registry status plus a full `rss_items` scan, which
is `daily-observation.mjs`'s job and genuinely expensive in a browser.
Named here as a known gap rather than quietly dropped — the CLI still
covers it.

## 2. Display — human-first

Follows `docs/editorial-operations-mvp-plan-v2.md`'s language layer.
Every line answers: what happened, does it need me, what do I do.

```
Laporan Hari Ini

Berita diproses:            896

Perlu perhatian:            43 berita belum pasti bidang
                            [Buka Senarai Semakan]

Perubahan editorial hari ini:
  1 berita dipindahkan ke Nasional
  1 berita disembunyikan

Tiada tindakan diperlukan:  853 berita
```

Rules:
- Never a `reason_code` — always a plain Malay sentence
- "Perlu perhatian" links straight to the Review Queue; a digest that
  reports a problem without a route to fix it just relocates the hunting
- Zero state is stated explicitly: **"Tiada apa-apa perlu perhatian hari
  ini."** — silence must be a confident answer, not an ambiguous blank

## 3. Scope

**In v1**: in-app panel at the top of `/admin`, edition-scoped (follows
the existing edition switcher), computed live on load.

**Not in v1**, all deliberate:
- No email, no push (no scheduled-job infrastructure exists)
- No history/trend (`db/observations/` holds day-over-day for the CLI;
  a trend UI is separate work)
- No silent-source detection (§1)
- No new tables, no migration

## 4. Verification

The digest only *reads*, so the 5-layer editorial-action standard
doesn't apply wholesale. What must be proven:

1. Numbers match reality — digest counts equal a direct database query
2. "Perlu perhatian" equals the Review Queue's actual length (they call
   the same function; a mismatch would mean a real bug)
3. Zero state renders correctly
4. No console errors, and the reader app is unaffected

## Next

Implement per this plan. No architecture change required, so per
ChatGPT's instruction implementation may proceed directly.
