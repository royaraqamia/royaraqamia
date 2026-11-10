-- ============================================================
-- The MCP marketplace, phase 1: the stores the outbound direction needs
--
-- `تطبيقاتنا` is gaining a marketplace: a member connects a third-party MCP
-- server and نور reaches it on their behalf (ADR-0155,
-- `docs/specs/mcp-marketplace.md`). Nothing in this file is reachable from a
-- browser — every table is service-role only, exactly like the inbound
-- `mcp_oauth_*` stores beside them, because each one holds either a member's
-- third-party credential or the state of a handshake that will become one.
--
-- Six tables, one per thing that has its own lifetime:
--
--   * `mcp_catalog_servers` — the mirror of registry.modelcontextprotocol.io.
--     The registry is preview and may reset its data, so our copy is the one
--     the screens read; a registry outage is a stale catalogue, not an empty
--     one.
--   * `mcp_connections` — one member's connection to one catalogue row. It
--     carries the URL it was authorised for (`server_url`) rather than reading
--     the catalogue's: a registry edit must not silently move a connection to a
--     different host, and the URL is half of what the OAuth grant is scoped to.
--   * `mcp_connection_credentials` — the tokens, AES-256-GCM encrypted through
--     `backend/shared/mcp-token-crypto.ts`. Separate from the connection so the
--     member-facing row never selects a ciphertext by accident and so a
--     re-authorisation is one upsert of one narrow row.
--   * `mcp_connection_tools` — what `tools/list` answered, and the member's
--     per-tool switches. A tool the server stops advertising is left in place
--     (`last_seen_at` stops moving) so a server's bad day does not silently
--     discard the member's choices.
--   * `mcp_connect_attempts` — the in-flight handshake: the PKCE verifier and
--     the state, hashed. It expires in minutes and is swept, because a verifier
--     that outlives its flow is a credential nobody is watching.
--   * `mcp_oauth_client_registrations` — who we are at each authorization
--     server. DCR is per redirect URI, so production and a preview deployment
--     are two registrations of the same server; the composite key is what keeps
--     that from becoming a bug.
--
-- The same file teaches `private.owned_item_count` about the outbound half of
-- `mcp_connected_apps`: the cap is one pool for both directions (ADR-0155), so
-- the count is inbound grants **plus** live outbound connections, and nothing
-- reserves a slot per direction.
--
-- Rollback: drop the six tables (the sweep function and its cron job name them,
-- so drop those first), then restore `private.owned_item_count` from
-- `20261111120000_owned_item_count_keeps_mcp_apps.sql`.
-- ============================================================

-- ------------------------------------------------------------
-- The catalogue mirror
-- ------------------------------------------------------------

create table if not exists public.mcp_catalog_servers (
  -- The registry's own key (`ac.inference.sh/mcp`), which is what a connection
  -- references and what the hourly sync upserts on.
  registry_name text primary key,
  title text,
  description text,
  -- The registry is English-only. A brand keeps its own name, so only the
  -- description is ever filled here; the screen shows the registry's text until
  -- somebody writes a better one.
  name_ar text,
  description_ar text,
  version text,
  -- The one address we can actually call: `remotes[]` entries of type
  -- streamable-http. A package server (npm, PyPI, Docker) is stdio, and a
  -- serverless function cannot run one.
  remote_url text not null,
  transport text not null default 'streamable-http'
    check (transport in ('streamable-http')),
  status text not null default 'active'
    check (status in ('active', 'deprecated', 'deleted')),
  published_at timestamptz,
  registry_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  -- The takedown switch. Auto-approval is the catalogue's rule, so removing a
  -- row is the one act a human must be able to perform without a deploy.
  blocked_at timestamptz,
  blocked_reason text,
  raw jsonb
);

create index if not exists idx_mcp_catalog_servers_listable
  on public.mcp_catalog_servers (status, fetched_at desc)
  where blocked_at is null;

-- ------------------------------------------------------------
-- A member's connection
-- ------------------------------------------------------------

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  -- `restrict`, not `cascade`: the sync never deletes a catalogue row (it marks
  -- it `deleted`), and a hard delete must not silently take members' grants and
  -- credentials with it.
  registry_name text not null
    references public.mcp_catalog_servers (registry_name) on delete restrict,
  server_url text not null,
  display_name text,
  enabled boolean not null default true,
  -- `ask` cards every write; `reads` runs read-only tools and still cards
  -- writes; `all` is the member's own widening, per app.
  permission_level text not null default 'ask'
    check (permission_level in ('ask', 'reads', 'all')),
  status text not null default 'active'
    check (status in ('active', 'needs_reauth', 'error', 'revoked')),
  tool_count integer not null default 0,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_synced_at timestamptz,
  last_error text
);

create index if not exists idx_mcp_connections_user
  on public.mcp_connections (user_id);

-- The cap read and the marketplace list both filter on a member's live
-- connections, which is the same pair of columns.
create index if not exists idx_mcp_connections_user_status
  on public.mcp_connections (user_id, status);

-- Finding the row a fresh consent belongs to, without a unique constraint:
-- a second account on the same server is a feature we have not ruled out.
create index if not exists idx_mcp_connections_user_catalog
  on public.mcp_connections (user_id, registry_name);

-- ------------------------------------------------------------
-- The credentials, encrypted
-- ------------------------------------------------------------

create table if not exists public.mcp_connection_credentials (
  connection_id uuid primary key
    references public.mcp_connections (id) on delete cascade,
  -- Which authorization server issued this, and where to refresh it. Stored
  -- rather than re-discovered: a refresh must not depend on a `.well-known`
  -- document that may have moved since the member consented.
  authorization_server text not null,
  token_endpoint text not null,
  registration_kind text not null
    check (registration_kind in ('dcr', 'static')),
  client_id text not null,
  client_secret_enc text,
  access_token_enc text not null,
  refresh_token_enc text,
  scope text,
  expires_at timestamptz,
  issued_at timestamptz not null default now(),
  -- The discovery document as it was read, so a later diagnosis can tell an
  -- expired token from a moved endpoint.
  metadata jsonb
);

-- ------------------------------------------------------------
-- The tools, and the switches
-- ------------------------------------------------------------

create table if not exists public.mcp_connection_tools (
  connection_id uuid not null
    references public.mcp_connections (id) on delete cascade,
  tool_name text not null,
  description text,
  input_schema jsonb,
  -- `annotations.readOnlyHint`, defaulted the safe way: a tool a server says
  -- nothing about is one that may write.
  read_only boolean not null default false,
  enabled boolean not null default true,
  -- Moves on every successful `tools/list`. A tool that stops moving is stale,
  -- which is drawn, not deleted.
  last_seen_at timestamptz not null default now(),
  primary key (connection_id, tool_name)
);

-- ------------------------------------------------------------
-- The handshake in flight
-- ------------------------------------------------------------

create table if not exists public.mcp_connect_attempts (
  -- The `state` parameter, hashed: a database dump must not contain a value
  -- that can be replayed into someone's consent.
  state_hash text primary key,
  user_id uuid not null,
  registry_name text not null,
  server_url text not null,
  -- Encrypted rather than stored raw for the same reason as the state: it is a
  -- credential with a five-minute life.
  code_verifier_enc text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_mcp_connect_attempts_expires
  on public.mcp_connect_attempts (expires_at);

create index if not exists idx_mcp_connect_attempts_user
  on public.mcp_connect_attempts (user_id);

-- ------------------------------------------------------------
-- Who we are at each authorization server
-- ------------------------------------------------------------

create table if not exists public.mcp_oauth_client_registrations (
  id uuid primary key default gen_random_uuid(),
  authorization_server text not null,
  -- DCR binds a client to the redirect URIs it registered; a preview origin and
  -- production are two clients, not one reused badly.
  redirect_uri text not null,
  client_id text not null,
  client_secret_enc text,
  registration_kind text not null default 'dcr'
    check (registration_kind in ('dcr', 'static')),
  registered_at timestamptz not null default now(),
  unique (authorization_server, redirect_uri)
);

-- ------------------------------------------------------------
-- Access control: service role only, like the inbound stores
-- ------------------------------------------------------------

alter table public.mcp_catalog_servers enable row level security;
alter table public.mcp_connections enable row level security;
alter table public.mcp_connection_credentials enable row level security;
alter table public.mcp_connection_tools enable row level security;
alter table public.mcp_connect_attempts enable row level security;
alter table public.mcp_oauth_client_registrations enable row level security;

revoke all on public.mcp_catalog_servers from anon, authenticated;
grant all on public.mcp_catalog_servers to service_role;

revoke all on public.mcp_connections from anon, authenticated;
grant all on public.mcp_connections to service_role;

revoke all on public.mcp_connection_credentials from anon, authenticated;
grant all on public.mcp_connection_credentials to service_role;

revoke all on public.mcp_connection_tools from anon, authenticated;
grant all on public.mcp_connection_tools to service_role;

revoke all on public.mcp_connect_attempts from anon, authenticated;
grant all on public.mcp_connect_attempts to service_role;

revoke all on public.mcp_oauth_client_registrations from anon, authenticated;
grant all on public.mcp_oauth_client_registrations to service_role;

create policy "mcp_catalog_servers_service_role"
  on public.mcp_catalog_servers
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_connections_service_role"
  on public.mcp_connections
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_connection_credentials_service_role"
  on public.mcp_connection_credentials
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_connection_tools_service_role"
  on public.mcp_connection_tools
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_connect_attempts_service_role"
  on public.mcp_connect_attempts
  for all
  to service_role
  using (true)
  with check (true);

create policy "mcp_oauth_client_registrations_service_role"
  on public.mcp_oauth_client_registrations
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- Hygiene: a handshake that was abandoned must not sit there
-- ------------------------------------------------------------
--
-- Mirrors `sweep_expired_mcp_oauth_tokens` (20260919180145): a SECURITY DEFINER
-- function revoke-locked from the public roles, scheduled through pg_cron. A
-- member who opens consent and closes the tab leaves a row behind; without this
-- the table grows one row per abandoned tap, each holding an encrypted verifier.

create extension if not exists pg_cron;

create or replace function public.sweep_expired_mcp_connect_attempts()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
begin
  delete from public.mcp_connect_attempts
  where expires_at < now();
end;
$fn$;

revoke execute on function public.sweep_expired_mcp_connect_attempts()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'mcp-connect-attempts-sweep') then
    perform cron.schedule(
      'mcp-connect-attempts-sweep',
      '15 3 * * *',
      $$select public.sweep_expired_mcp_connect_attempts()$$
    );
  end if;
end;
$do$;

-- ------------------------------------------------------------
-- The cap becomes one pool for both directions
-- ------------------------------------------------------------
--
-- The body is `20261111120000_owned_item_count_keeps_mcp_apps.sql` with one
-- change: `mcp_connected_apps` adds the member's live outbound connections to
-- the distinct inbound clients it already counted. No slot is reserved per
-- direction — a member who never connects an agent may spend the whole pool on
-- apps نور reaches (ADR-0155).
--
-- `plan_limits` is the list of items, so a rewrite that forgets one is a read
-- failure, not a wrong number: `supabase/tests/plan_reads_test.sql` fails when a
-- key has no branch here.

create or replace function private.owned_item_count(p_user_id uuid, p_item text)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_count integer;
begin
  case p_item
    when 'habits' then
      select count(*)::integer into v_count
        from public.habits
       where user_id = p_user_id and deleted_at is null;
    when 'expenses' then
      select count(*)::integer into v_count
        from public.expenses
       where user_id = p_user_id and deleted_at is null;
    when 'expense_categories' then
      select count(*)::integer into v_count
        from public.categories
       where user_id = p_user_id and deleted_at is null;
    when 'budgets' then
      select count(*)::integer into v_count
        from public.budgets
       where user_id = p_user_id and deleted_at is null;
    when 'short_links' then
      select count(*)::integer into v_count
        from public.short_links
       where user_id = p_user_id and deleted_at is null;
    when 'community_drafts' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id
         and deleted_at is null
         and status in ('draft', 'scheduled');
    when 'community_published' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id and deleted_at is null and status = 'published';
    when 'community_tags' then
      -- No tombstone column: the row is the slot.
      select count(*)::integer into v_count
        from public.community_tags
       where user_id = p_user_id;
    when 'community_categories' then
      select count(*)::integer into v_count
        from public.community_categories
       where user_id = p_user_id;
    when 'quran_bookmarks' then
      select count(*)::integer into v_count
        from public.quran_bookmarks
       where user_id = p_user_id and deleted_at is null;
    when 'notes' then
      select count(*)::integer into v_count
        from public.notes
       where user_id = p_user_id and deleted_at is null;
    when 'mcp_connected_apps' then
      -- One grant may hold an access and a refresh row for the same app, so the
      -- inbound half counts the app, not the token.
      select count(distinct t.client_id)::integer into v_count
        from public.mcp_oauth_tokens t
       where t.user_id = p_user_id
         and t.revoked_at is null
         and t.expires_at > now();

      -- The outbound half, in the same pool: a revoked connection frees its
      -- slot the moment it is revoked, which is what "disconnect" promises.
      select v_count + coalesce(count(*), 0)::integer into v_count
        from public.mcp_connections c
       where c.user_id = p_user_id
         and c.status <> 'revoked';
    when 'chat_groups' then
      -- Created by the member, and their own roster row is not `left`: leaving
      -- is the exit that frees a group slot, because nothing is hard-deleted.
      select count(*)::integer into v_count
        from public.chat_conversations c
       where c.created_by = p_user_id
         and c.kind = 'group'
         and not exists (
           select 1
             from public.chat_participants p
            where p.conversation_id = c.id
              and p.user_id = p_user_id
              and p.status = 'left'
         );
    else
      raise exception 'unknown owned item: %', p_item using errcode = '22023';
  end case;

  return v_count;
end;
$$;

revoke all on function private.owned_item_count(uuid, text) from public, anon, authenticated;
