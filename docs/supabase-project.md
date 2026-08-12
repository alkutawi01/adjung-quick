# Supabase Project — Adjung Quick

Status: real project created 2026-08-11, `db/schema.sql` migration run
successfully against it. This is the actual Stream A target, not a stand-in.

- **Organization:** alkutawi01 (Free plan)
- **Project name:** Adjung Quick
- **Project ref:** `njjiuhfsnlvjosiqozmn`
- **Region:** Northeast Asia (Tokyo, `ap-northeast-1`) — selected Asia-Pacific
  at creation; Supabase placed it in Tokyo specifically, not Singapore. Not
  changed after the fact — flag to Izzat if a different region is preferred
  (would require a new project, Supabase doesn't support region migration).
- **Separate from Adjung Core/Brief's existing Supabase project** — per
  project memory, Quick is a fully separate project/repo/stack. Nothing here
  reuses or touches the existing "Adjung" project in the same organization.
- **Security choices made during setup** (not asked in chat, made directly
  in the Supabase dashboard while creating the project):
  - "Automatically expose new tables" — left OFF. New tables are NOT
    auto-exposed to the Data API by default; access must be granted
    deliberately later.
  - RLS — enabled via the "Run and enable RLS" prompt when running the
    migration. `sources`, `story_clusters`, `rss_items` all have Row Level
    Security ON with (currently) zero policies, meaning **the anon/
    authenticated API keys can read/write nothing on these tables right
    now** — deny-by-default. Policies get added deliberately in a later
    step, not left to whatever Supabase's default would have been.

## What's actually in the database right now

Ran `db/schema.sql` (with `BEGIN;`/`COMMIT;`) directly in the Supabase SQL
Editor. Verified in Table Editor: `sources`, `story_clusters`, `rss_items`
all exist under the `public` schema.

**UPDATE — real ingestion completed and verified (`db/ingest-production.js`):**
Fetched real RSS (191 items, 9/9 sources), ran through the SAME
`lab/engine.js` dedup/scoring logic as the Laboratory, wrote the result into
this Supabase project via the `service_role` key (server-side only — see
`.env`, gitignored, never committed). Read the data back and compared
against `lab/engine.js`'s in-memory numbers:

| Metric | Lab | Supabase | |
|---|---|---|---|
| RSS items | 191 | 191 | ✓ exact match |
| Story clusters | 183 | 183 | ✓ exact match |
| Top editorial score | 84 | 84 | ✓ exact match |
| Top 5 ranked queue | — | — | ✓ identical order and IDs |

This is the real Stream A production verification ChatGPT asked for, not
the SQLite stand-in from earlier. Needed one fix mid-run: the initial
migration (with "Automatically expose new tables" off) didn't GRANT table
privileges to `service_role` either — inserts failed with `permission denied`
until `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;` (+ usage,
sequences, default privileges) was run. RLS itself was never the blocker —
`service_role` bypasses RLS by design; this was a separate GRANT issue.

`db/ingest-production.js` currently TRUNCATES and re-inserts on every run
(`DELETE ... WHERE id IS NOT NULL` on all three tables first) — fine for
repeated verification runs against an empty/test dataset, NOT how real
scheduled ingestion should behave long-term (that needs proper
upsert/dedup-aware logic, not wipe-and-reload). Flagged, not built yet.

## Known friction while doing this (for next time)

The SQL Editor's Monaco-based editor mangled multi-line paste (auto-indent
compounded on every line, and a `Ctrl+A` selection didn't reliably clear
before a subsequent paste, causing one throwaway duplicate-table error that
was cleaned up with `DROP TABLE IF EXISTS ... CASCADE` before the real run).
Setting content via `window.monaco.editor.getModels()[0].setValue(sql)`
directly was reliable — worth doing that from the start next time instead
of simulated typing.

## Not done yet (intentionally, per Stream A scope)

- No `active_set_slots` — still Fasa 1A/Transition Slice, not built.
- No connection string / env vars wired into `lab/` or `state/` code yet —
  those still run against real RSS + in-memory state, untouched by this.
  Wiring the engine to actually write into this database is a separate,
  not-yet-done step.

## UPDATE — Identity Layer vertical slice, real Supabase verification (2026-08-11)

Per ChatGPT (director) instruction: implement Auth + `saved_stories` +
`history_entries` as a real vertical slice, verified against actual
Supabase Auth + RLS — not just the design documents
(`docs/identity-personal-layer-audit.md`, `docs/identity-schema-design.md`
v1.1). Explicitly excluded from this slice, per ChatGPT: no anonymous
transfer/discard/selective flow, no login UX — those are a separate
"Transition Slice" for later.

**Migration:** `db/schema-identity.sql` — `saved_stories` and
`history_entries`, referencing Supabase's built-in `auth.users` (no custom
auth, no profile table). RLS enabled on both, own-row-only policies.
`history_entries` has no UPDATE policy (events are immutable, per design
doc §6). Uses Supabase Auth directly — no custom password system.

**Same GRANT gap hit again, same fix:** new tables via the SQL Editor with
"Automatically expose new tables" off don't get default privileges even
for the `authenticated` role (separate from RLS again — RLS was correctly
on and correctly blocking, but INSERT still failed with `permission denied
for table saved_stories` until `GRANT SELECT, INSERT, UPDATE, DELETE ON
saved_stories TO authenticated;` (+ similar for `history_entries`,
`USAGE ON SCHEMA public`) was run. This is the same lesson as Stream A's
`service_role` GRANT issue, now confirmed to also apply per-API-role, not
just per-service-account — worth remembering for every future table this
project adds: RLS policies and GRANT privileges are always two separate
steps, neither implies the other.

**Verification script:** `db/identity-test.js` (`npm run test:identity`)
— creates two real Supabase Auth users (A, B) via the admin API, signs
each in with the real `anon`/publishable key (so RLS is actually enforced
as the `authenticated` role, not bypassed), and proves against the live
database:

| Check | Result |
|---|---|
| Save creates one row | ✓ PASS |
| Re-saving the same story = upsert (no duplicate), `expires_at` refreshed | ✓ PASS |
| A cannot read B's saved_stories (RLS) | ✓ PASS |
| A cannot INSERT a row *as* B (RLS) | ✓ PASS |
| B can read/write B's own rows | ✓ PASS |
| Releasing the same story twice creates two separate history_entries rows (append-only, not upsert) | ✓ PASS |
| B cannot read A's history_entries (RLS) | ✓ PASS |
| **P-006 regression** — `editorial_score`, `workspace_state`, and all three score components on `story_clusters` are byte-identical before/after Save+History actions | ✓ PASS |
| `ON DELETE CASCADE` — deleting a user removes their saved_stories rows | ✓ PASS |

All 17 assertions pass against the real project (`njjiuhfsnlvjosiqozmn`),
using real `story_clusters` rows from the Stream A ingestion already in
the database. Test users are created and deleted within the same run —
nothing left behind.

**Still not done (per ChatGPT's explicit scope for this slice):**
anonymous session persistence, the Transfer/Discard/Selective decision UI
(L-050), login UX, and the `story_id` `ON DELETE RESTRICT` lifecycle
question flagged OPEN in `docs/identity-schema-design.md` §5.
