-- MCP OAuth stores: tables backing the public royaraqamia MCP server's OAuth 2.1
-- authorization flow (RFC 8414 metadata, RFC 7591 dynamic client registration,
-- authorization-code + PKCE, refresh + revocation).
--
-- Only the service role touches these tables (the MCP server uses the service-role
-- client). RLS is locked down to service_role only; no anon/authenticated access.
--
-- Security notes:
--  * Opaque bearer tokens are stored as SHA-256 hex digests (never raw).
--  * The user's Supabase refresh token (used to build a user-scoped data client)
--    is stored AES-256-GCM encrypted in `session_enc`; plaintext never persists.

create table if not exists public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_secret_hash text,
  client_name text,
  redirect_uris jsonb not null default '[]'::jsonb,
  scopes jsonb not null default '[]'::jsonb,
  registration_token_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists idx_mcp_oauth_clients_created
  on public.mcp_oauth_clients (created_at);

create table if not exists public.mcp_oauth_auth_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null,
  user_id uuid not null,
  code_challenge text not null,
  challenge_method text not null default 'S256',
  redirect_uri text not null,
  scope jsonb not null default '[]'::jsonb,
  session_enc text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_auth_codes_expires
  on public.mcp_oauth_auth_codes (expires_at);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  kind text not null check (kind in ('access', 'refresh')),
  client_id text not null,
  user_id uuid not null,
  scope jsonb not null default '[]'::jsonb,
  session_enc text,
  refresh_token_hash text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_tokens_user
  on public.mcp_oauth_tokens (user_id);
create index if not exists idx_mcp_oauth_tokens_refresh
  on public.mcp_oauth_tokens (refresh_token_hash);
create index if not exists idx_mcp_oauth_tokens_expires
  on public.mcp_oauth_tokens (expires_at);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_auth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;

revoke all on public.mcp_oauth_clients from anon;
revoke all on public.mcp_oauth_clients from authenticated;
grant all on public.mcp_oauth_clients to service_role;

revoke all on public.mcp_oauth_auth_codes from anon;
revoke all on public.mcp_oauth_auth_codes from authenticated;
grant all on public.mcp_oauth_auth_codes to service_role;

revoke all on public.mcp_oauth_tokens from anon;
revoke all on public.mcp_oauth_tokens from authenticated;
grant all on public.mcp_oauth_tokens to service_role;

create policy "mcp_oauth_clients_service_role"
  on public.mcp_oauth_clients
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_oauth_auth_codes_service_role"
  on public.mcp_oauth_auth_codes
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_oauth_tokens_service_role"
  on public.mcp_oauth_tokens
  for all
  to service_role
  using (true)
  with check (true);