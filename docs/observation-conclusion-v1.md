# Observation Conclusion v1 — Fasa 1 Output

Status: `[x] Observation` `[ ] Decision needed` `[ ] Implementation pending` `[ ] Closed`
**Data collection: IN PROGRESS — this document is not yet answerable.**

This is the **deliverable of Fasa 1** (`docs/roadmap-to-production-v1.md`),
requested by ChatGPT: after 7–14 days of daily observation, turn the raw
daily numbers into a *pattern* per Bidang — which is what Fasa 2's
decisions actually need. A pile of daily readings is not a conclusion;
this document is where they become one.

## How to fill this in

1. Run `node db/daily-observation.mjs` once a day. Each run records
   `db/observations/observation-YYYY-MM-DD.json` and prints the
   day-over-day diff.
2. After ~14 days, read the recorded files together and classify each
   Bidang's behaviour into the table below.
3. Only then does `docs/field-visibility-policy-v1.md`'s threshold get
   locked — per ChatGPT, and per the concrete lesson that made this
   necessary: Kesihatan went 1 → 0 within a single day (an HTML
   false-positive), proving a one-day reading can be actively
   misleading.

## Pattern vocabulary

| Pattern | Meaning |
|---|---|
| `stable daily` | Reliable supply every day |
| `stable but source dependent` | Consistent, but carried by one or two sources — fragile |
| `sporadic` | Real content, but arrives irregularly |
| `event-driven` | Near-zero baseline, spikes hard during a real event |
| `low volume` | Consistently thin, never truly absent |
| `absent` | Genuinely no supply across the whole window |

## ms-MY

| Bidang | Day-1 count | Pattern | Notes |
|---|---|---|---|
| Pendidikan | 193 | *(pending)* | |
| Bisnes | 93 | *(pending)* | |
| Sukan | 91 | *(pending)* | |
| Hiburan | 61 | *(pending)* | |
| Politik | 36 | *(pending)* | Ranking Engine pilot field |
| Teknologi | 31 | *(pending)* | |
| Jenayah | 28 | *(pending)* | |
| Gaya Hidup | 25 | *(pending)* | |
| Agama | 24 | *(pending)* | JAKIM sources dead (TLS) — expect `source dependent` |
| Bencana | 8 | *(pending)* | Expect `event-driven` — the case a flat threshold gets wrong |
| Sains | 5 | *(pending)* | |
| Alam Sekitar | 4 | *(pending)* | |
| Kesihatan | 0 | *(pending)* | Was a false positive; real supply unknown |

*(Malaysia 64 / Dunia 46 are geography fallbacks, not subject Bidang —
tracked separately, not part of the visibility decision.)*

## en-global / ar-global

Both editions have far lower absolute counts than `ms-MY`
(`en-global` 53/91 classified, `ar-global` 22/51). Per
`docs/field-visibility-evaluation-v1.md` §"What real evaluation
requires", the same raw threshold likely does not transfer — these need
their own pattern table once data exists, not a copy of ms-MY's numbers.

| Edition | Day-1 classified | Pattern conclusion |
|---|---|---|
| en-global | 53/91 (58%) | *(pending)* |
| ar-global | 22/51 (43%) | *(pending)* |

## Ranking pilot (ms-MY.Politik, editorial_v1)

| Metric | Day 1 | Conclusion |
|---|---|---|
| Candidate pool size | 36 | *(pending)* |
| Selected | 10 | *(pending)* |
| Day-over-day retention | n/a (first day) | *(pending)* |

Reminder when reading this later: **low retention is not a defect.** A
news reader is supposed to churn. What matters is whether the churn is
ordinary or structural (pool collapsing, selection freezing) — the alert
logic in `db/daily-observation.mjs` already separates those two cases.

## What this document must NOT become

Not a place to fix things. Per ChatGPT's standing post-launch
discipline: *ukur → faham pattern → buat keputusan → baru ubah.* Every
row here is evidence for a Fasa 2 decision, not a task list.
