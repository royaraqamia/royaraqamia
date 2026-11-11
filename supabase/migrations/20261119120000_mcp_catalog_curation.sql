-- ============================================================
-- Superseded: the first curation attempt
--
-- The Supabase integration recorded this version when the original file was
-- applied on the merge of #1260, but the file exceeded the migration's statement
-- timeout and did not complete (see `20261119160000_mcp_catalog_curation.sql`).
-- The version is in `supabase_migrations.schema_migrations`, so the repo must
-- still carry its filename for `check:migration-drift` — but running it again
-- would only repeat the failure.
--
-- The schema this version was meant to add is applied by
-- `20261119160000_mcp_catalog_curation.sql`, which is idempotent and also cleans
-- up a partial first attempt. This file intentionally changes nothing.
-- ============================================================

select 1;
