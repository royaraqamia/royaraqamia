-- downloader_blocklist / downloader_settings: the Admin-tunable half of the Media
-- Downloader (ADR-0020).
--
-- downloader_blocklist holds the domains and exact links an Admin has refused; a
-- create against a blocked link is rejected before any provider work happens.
-- downloader_settings is a single row (id = true) of the live caps an Admin can
-- tune without a deploy; the app falls back to DEFAULT_DOWNLOAD_SETTINGS when the
-- row is absent. Both tables are service-role only, like download_jobs.
--
-- Rollback:
--   drop table if exists public.downloader_settings;
--   drop table if exists public.downloader_blocklist;

create table if not exists public.downloader_blocklist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('domain', 'url')),
  value text not null,
  created_at timestamptz not null default now(),
  created_by text,
  unique (kind, value)
);

create index if not exists idx_downloader_blocklist_kind
  on public.downloader_blocklist (kind);

alter table public.downloader_blocklist enable row level security;

revoke all on public.downloader_blocklist from anon;
revoke all on public.downloader_blocklist from authenticated;
grant all on public.downloader_blocklist to service_role;

create policy "downloader_blocklist_service_role"
  on public.downloader_blocklist
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.downloader_settings (
  id boolean primary key default true check (id),
  max_duration_seconds int not null default 900,
  max_audio_bytes bigint not null default 52428800,
  max_video_bytes bigint not null default 209715200,
  max_concurrent_jobs int not null default 20,
  link_ttl_seconds int not null default 300,
  updated_at timestamptz not null default now()
);

insert into public.downloader_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.downloader_settings enable row level security;

revoke all on public.downloader_settings from anon;
revoke all on public.downloader_settings from authenticated;
grant all on public.downloader_settings to service_role;

create policy "downloader_settings_service_role"
  on public.downloader_settings
  for all
  to service_role
  using (true)
  with check (true);
