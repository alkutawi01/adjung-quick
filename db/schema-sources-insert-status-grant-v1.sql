-- schema-sources-insert-status-grant-v1.sql
-- Polish 6A (2026-08-19). Live audit against production (authenticated
-- admin session) found TWO write paths in db/source-registry-adapter.mjs
-- that have a complete adapter+UI (SourceRegistryPanel.jsx, several
-- rounds old) but were never actually grantable at the DB layer -- both
-- fail live with "permission denied for table sources":
--
--   1. addSource()      -- INSERT into sources, 9 columns exactly.
--   2. setSourceStatus() -- UPDATE status/active/updated_at.
--
-- updateSource() (name/url/trust_score/known_category/source_type/
-- exclude_patterns/extra_ca/updated_at) was already fixed in Polish 4B
-- and confirmed working repeatedly since -- untouched here.
--
-- Least-privilege, column-scoped, matches the same V2 admin-guard
-- pattern already verified safe (classification_rules, edition_rules,
-- sources UPDATE). Deliberately does NOT:
--   - re-run ALTER TABLE sources ENABLE ROW LEVEL SECURITY (already on,
--     touching it again risks repeating the Polish 4B SELECT-lockout
--     incident for no reason -- RLS is already enabled on this table);
--   - touch the existing SELECT policy (already correct, sources reads
--     work fine right now);
--   - touch the existing UPDATE policy sources_admin_update (already
--     correct -- this patch ADDS status/active to its column grant, it
--     does not redefine the policy itself, since that policy's USING/
--     WITH CHECK already covers UPDATE generically per-row, not
--     per-column -- Postgres column-level GRANT is a separate privilege
--     layer from the RLS policy);
--   - grant whole-table INSERT/UPDATE to anyone.
--
-- INSERT gets its OWN policy (sources_insert_admin_only) because no
-- INSERT policy exists yet on this table at all -- RLS with zero INSERT
-- policies means INSERT is unconditionally denied regardless of GRANT,
-- same class of gap the Polish 4B SELECT-lockout incident taught this
-- project to check explicitly rather than assume.

BEGIN;

-- addSource()
GRANT INSERT (
  id,
  name,
  url,
  language,
  trust_score,
  known_category,
  source_type,
  exclude_patterns,
  status
) ON public.sources TO authenticated;

-- setSourceStatus()
-- updated_at is deliberately re-listed here so this patch is complete
-- for that function's full write-shape on its own.
GRANT UPDATE (
  status,
  active,
  updated_at
) ON public.sources TO authenticated;

-- INSERT must stay admin-only at the real DB boundary, not just the UI
-- (assertAdmin() in source-registry-adapter.mjs is a client-side check,
-- not a substitute for this).
DROP POLICY IF EXISTS sources_insert_admin_only ON public.sources;

CREATE POLICY sources_insert_admin_only
ON public.sources
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
);

COMMIT;

-- Sahkan selepas jalan (jalankan berasingan, bukan sebahagian patch ni):
--   select grantee, privilege_type, column_name
--   from information_schema.column_privileges
--   where table_name = 'sources' and column_name in ('status', 'active');
-- Dijangka: authenticated + service_role + postgres sahaja utk UPDATE;
-- authenticated + service_role + postgres utk INSERT (kolum status);
-- TIADA anon.
