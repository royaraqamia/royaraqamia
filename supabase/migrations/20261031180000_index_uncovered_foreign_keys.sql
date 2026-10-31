-- Postgres does not index a foreign-key column automatically, so every
-- `ON DELETE`/`ON UPDATE` action on a parent row scans the child table to find
-- the rows it has to cascade, null out or block. The Supabase performance
-- advisor (`unindexed_foreign_keys`) reported nine such columns on this project
-- (#738); each one below is the child side of a real parent-side operation:
--
--   - `consultation_bookings.package_id` — deleting a Consultation Package
--     (`consultation_packages`, on delete restrict) scans the bookings that
--     still point at it;
--   - `news_source_requests.reviewed_by` and `news_sources.approved_by` —
--     `auth.users` references, so the scan is on account deletion;
--   - `news_source_requests.source_id`, `news_source_requests.user_source_id`
--     and `news_user_sources.request_id` — the news cleanup deletes requests
--     and sources, and both columns are `on delete set null`;
--   - `plan_activations.activated_by` and `user_plans.updated_by` — again
--     `auth.users`, on account deletion;
--   - `rate_sync_runs.snapshot_id` — `rate_snapshots`, on delete set null. No
--     read filters on it and nothing deletes a snapshot today, so this one is
--     write-only cost kept for consistency with the rest of the list
--     (docs/supabase.md, "Deliberate advisor findings").
--
-- The tables are small today, which is exactly why this is cheap now: it is
-- purely additive, changes no constraint, column or RLS policy, and no existing
-- query text depends on it.
--
-- Rollback:
--   drop index if exists public.idx_consultation_bookings_package_id;
--   drop index if exists public.idx_news_source_requests_reviewed_by;
--   drop index if exists public.idx_news_source_requests_source_id;
--   drop index if exists public.idx_news_source_requests_user_source_id;
--   drop index if exists public.idx_news_sources_approved_by;
--   drop index if exists public.idx_news_user_sources_request_id;
--   drop index if exists public.idx_plan_activations_activated_by;
--   drop index if exists public.idx_rate_sync_runs_snapshot_id;
--   drop index if exists public.idx_user_plans_updated_by;

create index if not exists idx_consultation_bookings_package_id
  on public.consultation_bookings (package_id);

create index if not exists idx_news_source_requests_reviewed_by
  on public.news_source_requests (reviewed_by);

create index if not exists idx_news_source_requests_source_id
  on public.news_source_requests (source_id);

create index if not exists idx_news_source_requests_user_source_id
  on public.news_source_requests (user_source_id);

create index if not exists idx_news_sources_approved_by
  on public.news_sources (approved_by);

create index if not exists idx_news_user_sources_request_id
  on public.news_user_sources (request_id);

create index if not exists idx_plan_activations_activated_by
  on public.plan_activations (activated_by);

create index if not exists idx_rate_sync_runs_snapshot_id
  on public.rate_sync_runs (snapshot_id);

create index if not exists idx_user_plans_updated_by
  on public.user_plans (updated_by);
