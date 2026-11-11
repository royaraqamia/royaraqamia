-- ============================================================
-- The catalogue keeps an admin's choice of remote
--
-- The registry publishes several `remotes[]` for one server and the mirror keeps
-- only the first `streamable-http` entry the egress policy accepts
-- (`backend/services/mcp/marketplace/catalog-service.ts`, `toUpsertRow`). That
-- choice is right most of the time and wrong for the servers that publish a
-- docs remote first: `com.cloudflare.mcp/mcp` lists
-- `https://docs.mcp.cloudflare.com/mcp`, which is no-auth and publishes no
-- RFC 9728 document, while the account server at
-- `https://observability.mcp.cloudflare.com/mcp` publishes one. The mirror
-- measured the docs server and the store hid a server that can be connected.
--
-- `remote_override` is the admin's choice, and the sync never writes it — the
-- same shape as `title_override`. The effective address is
-- `coalesce(remote_override, remote_url)`: the probe measures it, the connect
-- flow opens it, and a moved remote clears the verdict in the same write that
-- moves it, because the address is what was measured.
--
-- Rollback: drop the column.
-- ============================================================

alter table public.mcp_catalog_servers
  add column if not exists remote_override text;
