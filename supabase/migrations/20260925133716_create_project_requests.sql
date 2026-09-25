-- project_requests: inbound requests from prospective Clients asking royaraqamia
-- to build a project, submitted from /request-project.
--
-- These are leads, not reservations: no account is created, no seat is
-- allocated, nothing is paid, and no Client or Project record exists — the
-- Client is only the contact fields on this row (ADR-0005, ADR-0006). Like
-- training_applications, submissions are written server-side, so the table is
-- service-role only and no client ever reads or writes it directly.
--
-- `user_id` is deliberate provision for a future client area; nothing reads it
-- yet, and it stays NULL for the anonymous visitor, which is the norm (ADR-0005).

create table if not exists public.project_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_whatsapp text not null,
  email text,
  project_type text not null check (project_type in ('website', 'app', 'other')),
  description text not null,
  budget_range text,
  timeline text,
  existing_url text,
  reference_code text not null unique,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin list: filtered by status, newest first.
create index if not exists idx_project_requests_status_created
  on public.project_requests (status, created_at desc);

-- Admin list: unfiltered, newest first.
create index if not exists idx_project_requests_created
  on public.project_requests (created_at desc);

alter table public.project_requests enable row level security;

-- Only the service role may touch project requests. No anon/authenticated
-- access is required: submissions are written server-side and the admin list is
-- served through an admin-guarded API route.
revoke all on public.project_requests from anon;
revoke all on public.project_requests from authenticated;
grant all on public.project_requests to service_role;

create policy "project_requests_service_role"
  on public.project_requests
  for all
  to service_role
  using (true)
  with check (true);
