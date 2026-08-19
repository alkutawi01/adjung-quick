-- schema-sources-insert-status-grant-rollback-v1.sql
-- Reverses schema-sources-insert-status-grant-v1.sql. Leaves the
-- existing sources SELECT policy and sources_admin_update UPDATE policy
-- (Polish 4B) completely untouched -- only removes what this specific
-- patch added.

BEGIN;

DROP POLICY IF EXISTS sources_insert_admin_only ON public.sources;

REVOKE INSERT (
  id,
  name,
  url,
  language,
  trust_score,
  known_category,
  source_type,
  exclude_patterns,
  status
) ON public.sources FROM authenticated;

REVOKE UPDATE (
  status,
  active,
  updated_at
) ON public.sources FROM authenticated;

COMMIT;
