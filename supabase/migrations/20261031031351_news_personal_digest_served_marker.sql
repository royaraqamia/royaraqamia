-- Recovery of an out-of-band apply, not a new change (#619's marker column).
--
-- On 2026-10-31 03:13 UTC the Issue Implementer picked up #619, applied this
-- column to the linked project through the Supabase MCP `apply_migration` tool,
-- and then reported success while opening no pull request. The project recorded
-- version `20261031031351` and the schema gained the column; nothing in the repo
-- did, so `scripts/check-migration-drift.mjs` saw a version the repo has no file
-- for and `supabase db push` refused every later migration with "Remote migration
-- versions not found in local migrations directory."
--
-- The column is real: `news_source_preferences.last_personal_digest_at` is
-- `timestamp with time zone`, nullable, and every row is null. This file records
-- it under the version the project already has, so the two lists agree again.
-- That version is already in the project's history, which is the point: it is
-- never applied there again, and it exists so a fresh environment applying the
-- migrations in order ends up with the column the linked project has.
--
-- What the applied statement said beyond the column is unreadable (the MCP tool
-- does not expose its SQL here), so nothing else is asserted about it: no comment
-- on the column, no index. Re-running is a no-op either way.
--
-- The writer #619 asks for (`loadReaders` ordering by the marker, stamped after
-- every attempt, served or skipped) was not part of what the failed run left
-- behind; #619 stays open for it.
--
-- Rollback:
--   alter table public.news_source_preferences drop column if exists last_personal_digest_at;

alter table public.news_source_preferences
  add column if not exists last_personal_digest_at timestamptz;
