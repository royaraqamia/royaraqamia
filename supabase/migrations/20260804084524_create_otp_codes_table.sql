-- otp_codes: stores hashed one-time verification codes for the auth flow.
-- The app writes/reads this table exclusively via the service role, so RLS is
-- locked down to that role only. This mirrors the table that previously existed
-- only in the remote database (created manually, never tracked in migrations)
-- while tightening the select policy so clients can no longer read OTP hashes.

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  otp_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_otp_codes_email_created
  on public.otp_codes (email, created_at desc);

alter table public.otp_codes enable row level security;

-- Only the service role may touch OTP records. No anon/authenticated access is
-- required (the app never reads these rows through the client), so keep those
-- roles fully locked out.
revoke all on public.otp_codes from anon;
revoke all on public.otp_codes from authenticated;
grant all on public.otp_codes to service_role;

-- Drop the previous permissive select policy (added manually on the remote DB)
-- that let authenticated users read their own OTP hashes + salts.
drop policy if exists otp_select on public.otp_codes;
drop policy if exists otp_insert on public.otp_codes;
drop policy if exists otp_update on public.otp_codes;

create policy "otp_codes_service_role"
  on public.otp_codes
  for all
  to service_role
  using (true)
  with check (true);
