# Editorial Operations MVP — Closure Report v1 (2026-08-13)

Status: `[x] Fasa 3 closed` — written so Fasa 4 does not relitigate
settled decisions.

## What Fasa 3 was for

Before it, Izzat could only watch the classifier's output as a reader.
After it, his judgement is real system state. The operating loop now
closes:

```
Reader → Classification → Editorial Controls → Admin Review → Admin Digest
```

## What was built (all live in production)

| Phase | Delivered |
|---|---|
| 3.6.1 Foundation | `editors` allowlist on Supabase Auth, `story_overrides`/`source_overrides`, RLS, `resolveStoryField()`, role/permission logic |
| 3.6.2 Review Queue | `/admin` route, sign-in, role gate, mobile-first one-card-one-decision queue |
| 3.6.3a Hide | Resolver integration — the first time an editorial decision reached a reader |
| 3.6.3b Reclassify | Edition-scoped field override |
| 3.6.3c Boost | Scoring signal (`BOOST_WEIGHT`), `editorial_v1` only — backend complete, no admin surface |
| 3.6.3 Hardening | `docs/editorial-action-verification-standard-v1.md` |
| 3.6.4 Admin Digest | In-app daily status, reusing the Review Queue's own definition of a problem |

Tests grew to **14 suites, 0 failures**.

## Architecture decisions — settled, do not revisit without new evidence

1. **Generated Data ≠ Editorial State.** The classifier truncates and
   rewrites its own tables every run; human decisions therefore live in
   separate tables it never touches. This shaped the whole schema.
2. **Precedence is fixed**: source disable > hide > pin > reclassify >
   boost > generated classification. Restrictive beats permissive;
   specific beats general; human beats generated.
3. **Boost argues, pin decides.** Boost is a scoring modifier that can
   lose; pin bypasses the contest. A boost that always wins is a pin in
   disguise — guarded by test.
4. **Principle of Escalation.** Single-story impact = `editor`;
   compounding impact (pin, source overrides) = `admin`.
5. **Reader/admin auth are separate clients**, separate storage keys —
   different auth postures, not one client with a flag.
6. **Least privilege at the data layer.** Readers see overrides only
   through `public_active_overrides`, which omits `reason` and
   `created_by`. The base table stays editor-only (verified: anon gets
   401).
7. **UI success is not proof of persistence.** Five-layer verification
   for every editorial action.
8. **Don't build UI promising power the backend lacks.** Why Boost is
   gated to `editorial_v1` rather than shown everywhere.

## The most important lesson

Three separate bugs this phase shared one shape: **the action succeeded
visually and did nothing real.**

- `story_overrides` was written but never read → decisions had no effect
- No base `GRANT` → every editorial write failed silently; a reported
  UAT "PASS" turned out to have written **zero rows**
- `/admin` 404'd in production while passing every local test

None were logic errors, and no unit test could have caught them —
each lived in a layer between components. That is why the verification
standard exists, and why it demands database and production evidence
rather than a screenshot.

Corollary: **functional correctness ≠ operational correctness.** "Can I
sign in?" passed; "can I reload 20 times without hanging?" exposed a real
auth-lock bug.

## Known gaps — deliberate, with reasons

| Gap | Why not done | Where it's covered |
|---|---|---|
| **Pin** | Needs governance rules first (limits, duration, purpose) | `docs/pin-governance-design-v1.md` |
| **Boost surface** | Review Queue is for *fixing problems*; boost *promotes good stories* — wrong home | `docs/fasa-3.6.3c-boost-implementation-v1.md` |
| **Source override** | Cross-edition blast radius; story-level actions must prove stable first | `docs/editorial-action-spec-v1.md` |
| **History / undo UI** | `deactivateOverride()` exists and is tested, but nothing calls it from the UI | This report |
| **Incremental ingestion** | Destructive rebuild remains; explicitly frozen | `docs/ingestion-safety-guard-v2-decision.md` |
| **`content_mismatch` detection** | Needs `classify-production.js` to persist evidence it currently discards | `docs/review-queue-ui-implementation-plan-v1.md` |
| **Silent-source detection in digest** | Requires a full `rss_items` scan; stays CLI-only | `docs/admin-digest-implementation-plan-v1.md` |
| **Digest history/trends** | Data exists in `db/observations/`; no UI | This report |

## Real risks carried into Fasa 4

- **`editorial_v1` covers one field.** `ms-MY.Politik` only. Any future
  scoring feature is a silent no-op elsewhere — always check
  `getRankingVersion()` first.
- **No reliable database backups.** Google Drive snapshots only; test
  destructively with care.
- **One admin.** No second pair of eyes on an editorial decision.
- **Overrides expire, stories may not.** A 7-day override on a
  longer-lived story silently reverts. Not yet surfaced anywhere.

## Recommended Fasa 4 focus

Operations before power, per ChatGPT's closing note — do not add
capability faster than the ability to operate it:

1. Undo/history UI — the mechanism exists but no human can reach it
2. Pin, once its governance is approved
3. `content_mismatch` detection (needs the evidence-persistence change)
4. Ranking expansion beyond `Politik` — which would unlock Boost
   meaningfully

> Sebelum ini kita risau Adjung Quick hanya "portal RSS". Selepas Fasa 3,
> ia sudah ada benda yang portal berita biasa tidak ada — lapisan
> editorial control yang boleh diaudit.
