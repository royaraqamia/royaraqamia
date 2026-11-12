-- The auth mode a remote MCP server needs (#1269, ADR-0155 amendment).
--
-- v1 was OAuth 2.1 with dynamic registration only, so a server that needs no
-- credentials and a server that takes a member's own API key were both
-- unlinkable, and the store's `connectable = true` query hid every one of them.
-- A catalogue row now names one of three modes:
--
--   oauth    the consent flow this marketplace was built for;
--   none     the server answers without credentials;
--   api_key  the member supplies a key, sent in the server's documented header.
--
-- The mode is an admin's decision, not a guess: which header a key goes in is a
-- documented fact the probe cannot read, and a server that publishes nothing
-- must not be inferred into either mode. The probe records what it measured
-- beside the decision (`probe_auth_mode`), so the Admin Console can say "this row
-- is published as OAuth, but the server answered without credentials".

alter table public.mcp_catalog_servers
  add column if not exists auth_mode text not null default 'oauth'
    check (auth_mode in ('oauth', 'none', 'api_key')),
  add column if not exists probe_auth_mode text
    check (probe_auth_mode in ('oauth', 'none', 'api_key')),
  -- Where an api_key row's key goes, as the server documents it: the header name
  -- and the scheme it is prefixed with (`Authorization` + `Bearer` for Postman,
  -- `X-API-Key` and no prefix for the servers that take it bare). The sync never
  -- writes either column, so a publisher's next release cannot move our header.
  add column if not exists api_key_header text,
  add column if not exists api_key_prefix text;

comment on column public.mcp_catalog_servers.auth_mode is
  'oauth | none | api_key: how the connect flow authenticates. An admin decides; the probe only measures.';
comment on column public.mcp_catalog_servers.probe_auth_mode is
  'What the last probe observed: oauth when metadata+DCR answered, none when the handshake succeeded without a credential, api_key when the endpoint refused an unauthenticated call. NULL is "not measured".';

-- A connection remembers how it authenticates, because the catalogue row's mode
-- can be changed afterwards and a live connection must keep working the way it
-- was made.
alter table public.mcp_connections
  add column if not exists auth_mode text not null default 'oauth'
    check (auth_mode in ('oauth', 'none', 'api_key'));

comment on column public.mcp_connections.auth_mode is
  'oauth | none | api_key: the shape of the credential this connection holds, fixed when it was made.';

-- One credential row per connection, and the OAuth columns stop being mandatory:
-- a `none` connection has no row at all, and an `api_key` connection holds only
-- the encrypted key beside the header it belongs in. The key is written through
-- the same `encryptSecret` path as a token, so it is stored as ciphertext with
-- the key that never lives in this table.
alter table public.mcp_connection_credentials
  alter column authorization_server drop not null,
  alter column token_endpoint drop not null,
  alter column registration_kind drop not null,
  alter column client_id drop not null,
  alter column access_token_enc drop not null,
  add column if not exists api_key_enc text,
  add column if not exists api_key_header text,
  add column if not exists api_key_prefix text;

-- A row exists to hold one secret; a row with neither is a bug, not a state.
alter table public.mcp_connection_credentials
  add constraint mcp_connection_credentials_hold_one_secret
  check (access_token_enc is not null or api_key_enc is not null);

comment on column public.mcp_connection_credentials.api_key_enc is
  'A member-supplied API key, encrypted with MCP_TOKEN_ENCRYPTION_KEY. Never logged, never in a URL.';
