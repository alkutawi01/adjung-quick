# PostgreSQL Compatibility Audit — `db/schema.sql`

Status: manual syntax/semantics review, NOT executed against real Postgres.
No `psql`, local Postgres, or Docker is available in this environment — this
is the honest limit of what could be verified without those. `node:sqlite`
(used in `db/ingest-test.js`) proved data/behaviour, not Postgres syntax —
per ChatGPT's correct distinction. Treat this checklist as reducing risk,
not eliminating it; the first real migration run against Izzat's actual
Supabase project is still the true test.

| Item | Finding |
|---|---|
| **Trigger syntax** | `CREATE OR REPLACE FUNCTION ... RETURNS TRIGGER AS $$...$$ LANGUAGE plpgsql;` + `CREATE TRIGGER ... EXECUTE FUNCTION ...;` — correct modern syntax (Postgres 11+; Supabase runs recent Postgres, so `EXECUTE FUNCTION` is right, not the older `EXECUTE PROCEDURE`). |
| **Constraint behaviour** | `CHECK`, `NOT NULL`, `DEFAULT`, `REFERENCES ... ON DELETE CASCADE`, and the deferred `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY` (for the `story_clusters` ⇄ `rss_items` circular reference) all use standard, current syntax. |
| **Partial indexes** | `WHERE active = TRUE` and `WHERE rss_guid IS NOT NULL` / `WHERE normalized_url IS NOT NULL` — correct Postgres partial-index syntax. |
| **Timestamp semantics** | `TIMESTAMPTZ` + `DEFAULT now()` throughout — correct; `now()` returns `timestamptz`, matching the column type (no implicit cast surprises). |
| **JSON/array types** | Not used anywhere in this migration — N/A for Stream A's three tables. |
| **`ON CONFLICT`** | Not part of DDL — will matter once ingestion `INSERT` statements are written (not yet, per ChatGPT's "don't build ingestion write path yet" instruction implicit in stopping at schema+audit). Flagged for that future step, not a gap in `schema.sql` itself. |
| **Ordering / circular FK** | `sources` → `story_clusters` (no FK to `rss_items` yet) → `rss_items` (FKs to both) → `ALTER TABLE story_clusters ADD CONSTRAINT ...` (closes the circular reference) → trigger. This ordering is required and correct — `rss_items` can't exist before `story_clusters`, and the reverse FK can't be added before `rss_items` exists. |
| **Transaction behaviour** | **Gap found and fixed**: the original file had no explicit transaction wrapper. Supabase's migration CLI wraps each file automatically, but relying on that silently wasn't good practice — added explicit `BEGIN;` / `COMMIT;` around the whole migration so it's atomic regardless of how it's applied. |
| **`FOR UPDATE SKIP LOCKED`** | Not present — correctly out of scope for a DDL migration; belongs in the future admission query (`selectActiveSetWithControl`'s eventual SQL form), which isn't written yet per "don't build `active_set_slots` yet." |

## One design question surfaced while auditing (not a syntax bug)

`story_clusters.workspace_state` CHECK allows `'active'` as a value, but
Stream A doesn't yet have anywhere that sets it — `active_set_slots`
(Stream B, not built) is what tracks Active Set membership today per the
architecture skeleton. Leaving `'active'` in the CHECK is harmless (unused
enum value) but worth a note: whichever stream ends up marking a cluster
`'active'` should be decided once `active_set_slots` design resumes, not
assumed now.

## Bottom line

No syntax errors found on manual review; one real gap (missing transaction
wrapper) found and fixed. This does not replace running the migration
against actual Supabase — recommend that be the very first thing done once
Izzat provides project access, before anything else in Stream A resumes.
