# Editorial Desk — Implementation Plan v1 (2026-08-15)

Status: `[x] Plan` `[ ] Approved` — **no code, no UI, no migration**

FASA 4.3, per ChatGPT's instruction: the product spec
(`docs/editorial-desk-product-spec-v1.md`) established *what* Editorial
Desk is conceptually; this document answers the four concrete questions
that stand between concept and a first line of code — still without
writing any. Every claim below is checked against the real routing/auth
setup, not assumed.

## 1. Editorial Desk shell — Option A vs Option B, checked against real infra

**Option A**: nest under existing `/admin` (`/admin` → Digest/Queue/
Timeline reorganized into the product spec's four sections, same page).
**Option B**: new top-level route, e.g. `/editorial`.

Checked, not guessed:

| | Finding |
|---|---|
| **Routing today** | `ui/src/main.jsx:10` — `const isAdminRoute = window.location.pathname.startsWith('/admin')`. No router library — a single path-string check decides `<AdminApp />` vs `<App />`. Adding a genuinely new top-level route means extending this exact check, not a large change, but a real one. |
| **Vercel rewrite** | `vercel.json` has **exactly one** rewrite: `"/admin" → "/index.html"` — an exact-match string, not a wildcard (`/admin/(.*)`). A new route (`/editorial`) needs its **own** new rewrite entry added; `/admin` itself doesn't currently support sub-paths either (e.g. `/admin/queue` isn't wired, meaning Option A's "sections" would need to be in-page state, not real sub-routes, unless the wildcard rewrite is added too). |
| **Supabase session** | `ui/src/admin/adminSupabase.js:24` — session persists via `localStorage` with its own `storageKey: 'adjung-quick-admin-auth'`, independent of which URL path is loaded. **Not a blocker for either option** — a signed-in editor's session survives regardless of route. |
| **Auth gate** | `AdminApp.jsx`'s sign-in/role-check logic is a React component, reusable regardless of which URL renders it. |

**Recommendation, not decided here**: **Option A (nest under `/admin`)** —
it needs zero new Vercel rewrite, zero new top-level routing logic, and
the existing auth gate already wraps it. Option B's only real advantage
would be a cleaner mental separation ("editorial work" vs "admin
settings"), but nothing in this project's `/admin` currently holds
non-editorial settings that would justify that separation. Flagged as
a recommendation, not assumed — this is exactly the kind of "don't
choose based on ease alone" decision ChatGPT asked to be checked against
real infra first, which is now done.

## 2. Feature order — the concrete requirements per phase

Per the product spec's priority (Pin → Boost → Correction refinement),
naming what each phase actually needs, not building it:

**Phase 4.3.1 — Pin Surface**
- Who can open it: admin only (`ADMIN_ONLY_ACTIONS` already includes
  `'pin'`, `db/editor-auth.mjs:45` — enforcement point exists, only the
  UI is missing)
- Where the story comes from: **the open question §3 exists to answer**
  — Pin is not reachable from the Review Queue today by design (Review
  Queue = classification problems, Pin = a promotional decision on a
  correctly-classified story)
- How field is chosen: `submitPinOverride`'s `newField` parameter
  already requires an explicit field (`reviewQueueAdapter.js:274`) —
  the UI needs a field picker, not a design decision, since the
  taxonomy already exists per edition (`state/editions.js`)
- How expiry is shown: `story_overrides.expires_at` already exists and
  is server-computed (per `schema-fix-server-side-expiry.sql`) — the UI
  needs to *display* it, not compute it
- How the 2-pin limit is shown: the guard already refuses a 3rd pin
  with a readable error (`reviewQueueAdapter.js`'s pin guards, tested
  in `state/pin.test.mjs`) — the UI needs to surface that refusal
  message, and ideally show "2/2 pins active" state *before* an editor
  attempts a 3rd, not just react to the rejection after the fact

**Phase 4.3.2 — Boost Surface**
- `boostAvailable(edition, field)` check: already exists as inline
  logic in `AdminApp.jsx:215` — Phase 4.3.2's job is to carry this
  exact contract into whatever new component structure Editorial Desk
  introduces, not redesign the check itself
- Handling an unavailable field: `ReviewQueueCard.jsx`'s existing
  "belum tersedia" message is the pattern to preserve, not replace
- Explaining "naikkan" without promising a position: Boost adds a fixed
  score weight (`BOOST_WEIGHT`, per the ranking engine's own
  documentation) — it does not guarantee placement, since ranking
  still depends on other candidates' scores. The UI copy needs to say
  "boosted," never "will appear at position N."

**Phase 4.3.3 — Correction Surface refinement (Hide/Reclassify)**
- Explicitly last, per the product spec's own reasoning: these already
  have a working UI and workflow (`ReviewQueueCard.jsx`) — this phase
  is about fitting them into the new four-section structure, not
  building new capability.

## 3. Source of story selection — the actual biggest open question

Restating ChatGPT's own framing because it's the crux of Phase 4.3.1:
**Pin and Boost both need "which story am I acting on?", and the
Review Queue is structurally the wrong answer** — it exists to surface
classification *problems* (unclassified/low-confidence stories), while
Pin/Boost apply to stories that are *already correctly classified* and
an editor wants to promote anyway. Today, nothing in the UI lets an
editor browse or search correctly-classified stories at all.

**Options, none decided here**:
- **Active Set browser** — show what a reader currently sees per
  (edition, field), let an editor pick from that live view. Closest to
  "what the reader sees," but ties the picker to the Active Set's own
  capacity limits (10 slots) rather than the full candidate pool.
- **Search** — a text search over `story_clusters`/`rss_items` titles.
  Most flexible, but is new functionality this project doesn't have
  anywhere yet (not even the reader-facing app has search).
- **Field list / recent stories per field** — browse
  `edition_story_classifications` filtered by field, most recent first.
  Reuses data already being fetched elsewhere (similar shape to what
  `fetchReviewQueue` already does, minus the low-confidence filter).
- **All `story_clusters`** — technically simplest, but doesn't scale
  as a picking UI once volume is realistic (hundreds of clusters per
  ingest cycle, confirmed by this session's own real ingestion runs:
  877-896 clusters per cycle).

**Recommendation, not decided here**: "Field list / recent stories per
field" is the smallest addition that reuses existing query shapes and
matches how an editor actually thinks ("I want to pin something in
Politik," not "let me search all clusters"). Search and a full Active
Set browser are both real future candidates, not ruled out, just not
proposed as the V1 answer.

## 4. Verification contract — the FASA 3 lesson, restated as a requirement

Per ChatGPT's explicit instruction, every new Editorial Desk feature
must be verified through the full chain, not just "the button works":

```
UI action
    ↓
Auth (role check — editor vs admin-only)
    ↓
Database row (the actual story_overrides insert, checked directly)
    ↓
Reader effect (does the reader-facing app actually change as a result)
    ↓
Undo/expiry (does undoing it, or letting it expire, actually restore
             the prior state)
```

This mirrors exactly the discipline this session's own FASA 4.2 work
used for the staging+swap migration (real database queries, real
browser checks, not just "the script exited 0") — named here as a
requirement for Editorial Desk specifically because FASA 3's own
earlier audits found gaps exactly where only the button/click was
tested and the downstream chain wasn't.

## What this document does NOT do

- No code, no component, no route added
- No migration, no schema change
- No Vercel config change
- Does not resolve the story-selection mechanism (§3) — recommendation
  only, not a decision
- Does not choose Editorial Desk shell vs Pin surface as the actual
  first implementation step — per ChatGPT's instruction, that choice
  comes only after this document is reviewed

## Next

Awaiting review. Per ChatGPT: only after this document is approved,
decide whether implementation begins with the Editorial Desk shell or
the Pin surface.
