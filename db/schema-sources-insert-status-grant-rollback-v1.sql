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

-- updated_at deliberately NOT revoked here -- it was already GRANTed to
-- authenticated by the Polish 4B updateSource() patch (independent of
-- this one) and updateSource() still writes it on every call. This
-- rollback only removes status/active, the two columns THIS patch
-- actually added (ChatGPT's catch, 2026-08-19 -- the original draft of
-- this file would have silently broken updateSource() by revoking a
-- column another feature still legitimately needs).
REVOKE UPDATE (
  status,
  active
) ON public.sources FROM authenticated;

COMMIT;
