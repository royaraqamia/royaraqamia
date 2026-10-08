-- downloader_platforms: runtime state for the Media Downloader Platform allowlist.
--
-- The catalogue of Platforms (which exist and their default enabled flag) lives in
-- code (backend/services/downloader/platform-catalog.ts, ADR-0020). This table holds
-- only what changes at runtime: an Admin's `enabled` override (null = catalogue
-- default) and a Platform's circuit-breaker counters. `downloader_platforms` grants
-- nothing to anon or authenticated, so every read and write goes through the app on
-- the service role, like `download_jobs`.
--
-- Rollback:
--   drop table if exists public.downloader_platforms;

create table if not exists public.downloader_platforms (
  platform text primary key,
  enabled boolean,
  consecutive_failures int not null default 0,
  open_until timestamptz,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.downloader_platforms enable row level security;

revoke all on public.downloader_platforms from anon;
revoke all on public.downloader_platforms from authenticated;
grant all on public.downloader_platforms to service_role;

create policy "downloader_platforms_service_role"
  on public.downloader_platforms
  for all
  to service_role
  using (true)
  with check (true);
