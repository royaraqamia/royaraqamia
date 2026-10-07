-- download_jobs / download_job_events: the public Media Downloader (/downloader).
--
-- One download_jobs row is one Download: a single request to turn one Platform
-- media link into a saved file. Media is never stored (ADR-0018); the row keeps
-- only the short-lived signed provider link. download_job_events records each
-- Download Status transition. Both tables are service-role only: every read and
-- write goes through the app, so no anon/authenticated grant exists.
--
-- Rollback:
--   drop table if exists public.download_job_events;
--   drop table if exists public.download_jobs;

create table if not exists public.download_jobs (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  format text not null check (format in ('audio', 'video-360p', 'video-720p', 'video-1080p')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  platform text,
  error text,
  file_url text,
  file_filename text,
  file_size_bytes bigint,
  file_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_download_jobs_created_at
  on public.download_jobs (created_at desc);

create index if not exists idx_download_jobs_status
  on public.download_jobs (status);

alter table public.download_jobs enable row level security;

revoke all on public.download_jobs from anon;
revoke all on public.download_jobs from authenticated;
grant all on public.download_jobs to service_role;

create policy "download_jobs_service_role"
  on public.download_jobs
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.download_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.download_jobs (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_download_job_events_job_id
  on public.download_job_events (job_id, created_at);

alter table public.download_job_events enable row level security;

revoke all on public.download_job_events from anon;
revoke all on public.download_job_events from authenticated;
grant all on public.download_job_events to service_role;

create policy "download_job_events_service_role"
  on public.download_job_events
  for all
  to service_role
  using (true)
  with check (true);
