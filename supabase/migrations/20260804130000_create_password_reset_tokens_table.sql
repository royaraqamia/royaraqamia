-- password_reset_tokens: stores hashed one-time reset tokens sent via Resend.
-- Tokens are hashed (scrypt) with a per-record salt, mirroring the otp_codes table.
-- The app writes/reads this table exclusively via the service role, so RLS is
-- locked down to that role only.

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid not null,
  token_hash text not null,
  salt text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_tokens_email_created
  on public.password_reset_tokens (email, created_at desc);

alter table public.password_reset_tokens enable row level security;

revoke all on public.password_reset_tokens from anon;
revoke all on public.password_reset_tokens from authenticated;
grant all on public.password_reset_tokens to service_role;

create policy "password_reset_tokens_service_role"
  on public.password_reset_tokens
  for all
  to service_role
  using (true)
  with check (true);
