-- retainers: inbound requests from prospective Clients asking royaraqamia to
-- take on the monthly maintenance of their own projects, submitted from /hire
-- and sold publicly as التَّوظيف الشَّهري.
--
-- These are requests, not subscriptions: no account is created, nothing is paid
-- and no billing exists — the arrangement is collected offline (ADR-0006). Like
-- project_requests and training_applications, submissions are written
-- server-side, so the table is service-role only and no client ever reads or
-- writes it directly.
--
-- `monthly_fee_usd` defaults to the advertised figure so a row is self-describing
-- the moment it lands; it records the agreed terms, not a charge. `paid_through`
-- is the Admin's offline-collection bookkeeping and stays NULL until the Admin
-- records it.
--
-- `user_id` is deliberate provision for a future client area; nothing reads it
-- yet, and it stays NULL for the anonymous visitor, which is the norm (ADR-0005).

create table if not exists public.retainers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_whatsapp text not null,
  email text,
  company text,
  current_projects text not null,
  needs text not null,
  preferred_start date,
  monthly_fee_usd numeric(10, 2) not null default 100 check (monthly_fee_usd > 0),
  paid_through date,
  reference_code text not null unique,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'active', 'paused', 'ended')),
  notes text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin list: filtered by status, newest first.
create index if not exists idx_retainers_status_created
  on public.retainers (status, created_at desc);

-- Admin list: unfiltered, newest first.
create index if not exists idx_retainers_created
  on public.retainers (created_at desc);

alter table public.retainers enable row level security;

-- Only the service role may touch retainers. No anon/authenticated access is
-- required: submissions are written server-side and the admin list is served
-- through an admin-guarded API route.
revoke all on public.retainers from anon;
revoke all on public.retainers from authenticated;
grant all on public.retainers to service_role;

create policy "retainers_service_role"
  on public.retainers
  for all
  to service_role
  using (true)
  with check (true);
