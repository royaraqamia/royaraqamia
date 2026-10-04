-- rate_snapshots and rate_sync_runs: the public Exchange Rates feature (/rates).
-- Each successful fetch of the external feeds (Frankfurter for fiat, Gold-API.com
-- for gold and silver) is stored as one Rate Snapshot: the complete set of rates
-- captured at one moment, stamped with the provider's own quote date. rate_sync_runs
-- records every attempt, so feed health is answerable without an admin surface
-- (ADR-0010, ADR-0011). Metals are stored apart from fiat because they are a different
-- concept (ADR-0009). Snapshots are public read-only; sync runs are service-role only.
--
-- Rollback:
--   drop table if exists public.rate_sync_runs;
--   drop table if exists public.rate_snapshots;

create table if not exists public.rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD',
  provider_quote_date date not null,
  fetched_at timestamptz not null default now(),
  rates jsonb not null default '{}'::jsonb,
  metals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_rate_snapshots_fetched_at
  on public.rate_snapshots (fetched_at desc);

create index if not exists idx_rate_snapshots_quote_date
  on public.rate_snapshots (provider_quote_date desc);

alter table public.rate_snapshots enable row level security;

revoke all on public.rate_snapshots from anon;
revoke all on public.rate_snapshots from authenticated;
grant select on public.rate_snapshots to anon;
grant select on public.rate_snapshots to authenticated;
grant all on public.rate_snapshots to service_role;

create policy "rate_snapshots_public_read"
  on public.rate_snapshots
  for select
  to anon, authenticated
  using (true);

create policy "rate_snapshots_service_role"
  on public.rate_snapshots
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.rate_sync_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references public.rate_snapshots (id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'success', 'failure')),
  provider text not null default 'frankfurter+gold-api',
  provider_quote_date date,
  currency_count integer not null default 0,
  metal_count integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_rate_sync_runs_started_at
  on public.rate_sync_runs (started_at desc);

alter table public.rate_sync_runs enable row level security;

revoke all on public.rate_sync_runs from anon;
revoke all on public.rate_sync_runs from authenticated;
grant all on public.rate_sync_runs to service_role;

create policy "rate_sync_runs_service_role"
  on public.rate_sync_runs
  for all
  to service_role
  using (true)
  with check (true);
