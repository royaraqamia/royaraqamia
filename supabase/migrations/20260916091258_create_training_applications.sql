-- training_applications: inbound requests from prospective students to join the
-- training course, submitted from /training/apply.
--
-- These are leads, not reservations: no seat is allocated, no payment is taken,
-- and nothing is scheduled. Contrast with consultation_bookings, which is
-- authenticated and does reserve a slot. Submissions are anonymous (the public
-- POST goes through the service role), so like otp_codes this table is
-- service-role only and no client ever reads it directly.

create table if not exists public.training_applications (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null,
  full_name text not null,
  phone_whatsapp text not null,
  email text,
  experience_level text not null
    check (experience_level in ('beginner', 'basic', 'experienced')),
  goal text,
  reference_code text not null unique,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'enrolled', 'rejected')),
  notes text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin list: filtered by status, newest first.
create index if not exists idx_training_applications_status_created
  on public.training_applications (status, created_at desc);

-- Admin list: unfiltered, newest first.
create index if not exists idx_training_applications_created
  on public.training_applications (created_at desc);

alter table public.training_applications enable row level security;

-- Only the service role may touch applications. No anon/authenticated access is
-- required: submissions are written server-side and the admin list is served
-- through an admin-guarded API route.
revoke all on public.training_applications from anon;
revoke all on public.training_applications from authenticated;
grant all on public.training_applications to service_role;

create policy "training_applications_service_role"
  on public.training_applications
  for all
  to service_role
  using (true)
  with check (true);
