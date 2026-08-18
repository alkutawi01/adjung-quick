-- schema-edition-rules-rollback-v1.sql
--
-- Rollback for schema-edition-rules-v1.sql + schema-edition-rules-rpc-v1.sql.
-- Clean rollback — at the point this exists, edition_rules ships empty
-- and no production code path reads it yet (resolver wiring is a later,
-- separate step), so this drops a genuinely unused table.
--
-- Only run this if the Fasa 4 Admin Edition Rules migration needs to be
-- reversed. Not part of the normal apply sequence.

BEGIN;

DROP FUNCTION IF EXISTS add_edition_rule(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS archive_edition_rule(UUID, TEXT);
DROP FUNCTION IF EXISTS restore_edition_rule(UUID);

DROP TABLE IF EXISTS public.edition_rules;

COMMIT;
