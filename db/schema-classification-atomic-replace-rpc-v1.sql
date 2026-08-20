-- schema-classification-atomic-replace-rpc-v1.sql — P0-B, 2026-08-20.
--
-- Fixes a real atomicity gap in classify-production.js's write path, found
-- while designing the automatic ingest->classify hook (docs/p0-classification-
-- backlog-incident-v1.md): the old flow ran DELETE (one HTTP request) then a
-- BATCHED UPSERT loop of 500-row chunks (multiple separate HTTP requests).
-- supabase-js/PostgREST issues one HTTP request per statement — there is no
-- client-side BEGIN/COMMIT spanning separate .from() calls, same fact
-- schema-ingestion-staging-functions-v1.sql's header already documents for
-- the swap. If any batch failed partway through, the table was left with the
-- DELETE committed and only SOME of the new rows written — readers would see
-- an empty or partial classification table until someone noticed and re-ran
-- the script by hand. Tolerable for an occasional manual run; not tolerable
-- once this becomes an automatic step after every ingestion (P0-B).
--
-- One function call = one Postgres implicit transaction: either every row
-- replaces the old set, or (on any error, including an INSERT hitting the
-- story_clusters FK for a story that no longer exists) NONE of it does and
-- the previous classification stays exactly as it was.
--
-- PURELY ADDITIVE — no existing table touched, no column changed.

BEGIN;

-- p_rows: a JSONB array, each element shaped exactly like the row objects
-- classify-production.js already builds (story_id, edition_id, field,
-- field_code, subject_code, sub_field, classification_status,
-- classification_method, classification_rule, classification_confidence,
-- ruleset_version). Building the array in JS and validating/mapping it in
-- SQL keeps the classification LOGIC in classify-production.js (JS, testable
-- without a live DB) and only the WRITE mechanics move server-side — the
-- same division schema-edition-rules-rpc-v1.sql's functions keep between
-- caller-side data and server-side write safety.
CREATE OR REPLACE FUNCTION replace_edition_story_classifications(
  p_rows JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Adversarial review, P0-B: with classification now callable from TWO
  -- places (a human's manual --write, and ingest-production.js's automatic
  -- post-swap hook), a genuine race is possible -- both could call this
  -- function at nearly the same moment. Under READ COMMITTED, the
  -- second-to-commit transaction's DELETE cannot see the first's
  -- just-committed INSERTs, so its own INSERT then collides on the
  -- (story_id, edition_id) PRIMARY KEY and aborts with a raw "duplicate
  -- key" error -- not data corruption (the loser's transaction fully rolls
  -- back, the atomicity guarantee above still holds), but a confusing
  -- failure for what is really just an ordinary "two writers, one table"
  -- situation. A transaction-scoped advisory lock serializes the two
  -- transactions instead: the second caller simply WAITS for the first to
  -- commit or roll back, then proceeds cleanly against the settled state.
  -- Released automatically at COMMIT/ROLLBACK -- never needs an explicit
  -- unlock, and can never be left held by a crashed session.
  PERFORM pg_advisory_xact_lock(hashtext('replace_edition_story_classifications'));

  -- Refuses an empty batch outright, never treats "0 rows computed" as
  -- "intentionally wipe every classification". The old script could only
  -- reach its truncate with a real (possibly small, but non-empty) rows
  -- array — an RPC that will be called automatically after every ingestion
  -- needs to refuse a caller bug (e.g. the compute step silently returning
  -- []) rather than have it read as "clear the whole table". If a genuine
  -- full wipe is ever needed, it stays a manual DELETE, same posture as
  -- every other destructive path in this project (docs/production-write-
  -- guard-v1.md's philosophy, applied here at the SQL layer instead).
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION
      'replace_edition_story_classifications: refusing to write 0 rows -- '
      'this would silently wipe every existing classification. If a full '
      'wipe is genuinely intended, do it as an explicit manual DELETE.';
  END IF;

  -- Full-table replace, not scoped to one edition -- matches the old
  -- script's exact semantics (classify-production.js computes rows for
  -- EVERY edition in one pass, so a full delete+reinsert is correct only as
  -- long as every run does exactly that; a future caller that computes rows
  -- for a single edition only must NOT call this function, or it will
  -- silently drop every other edition's classifications).
  DELETE FROM edition_story_classifications;

  INSERT INTO edition_story_classifications (
    story_id, edition_id, field, field_code, subject_code, sub_field,
    classification_status, classification_method, classification_rule,
    classification_confidence, ruleset_version
  )
  SELECT
    r->>'story_id',
    r->>'edition_id',
    r->>'field',
    r->>'field_code',
    r->>'subject_code',
    r->>'sub_field',
    r->>'classification_status',
    r->>'classification_method',
    r->>'classification_rule',
    -- Matches the column's own DEFAULT 0 (schema-edition-classification.sql)
    -- for the same "missing confidence" case the old JS write already
    -- allowed through as `undefined` (Supabase mapped that to the column
    -- default). NULLIF guards against an empty string reaching ::numeric,
    -- which would raise "invalid input syntax" and abort the whole batch.
    COALESCE(NULLIF(r->>'classification_confidence', '')::numeric, 0),
    r->>'ruleset_version'
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- service_role only, same posture as every other write path in this
-- project (schema-ingestion-staging-functions-v1.sql, schema-edition-rules-
-- rpc-v1.sql) — REVOKE FROM PUBLIC explicit in the same block as the GRANT,
-- per the Phase 2 security-incident lesson those files already apply.
REVOKE EXECUTE ON FUNCTION replace_edition_story_classifications(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_edition_story_classifications(JSONB) TO service_role;

COMMIT;
