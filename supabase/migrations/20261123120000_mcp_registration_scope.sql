-- ============================================================
-- A registration remembers the permissions it was created for
--
-- A provider can fix the grant at the client registration and ignore the
-- `scope` a later consent asks for. Measured on Supabase (2026-11-11): the
-- authorization URL's `scope` was ignored — asking for `database:read` returned
-- all 13 published scopes, and a made-up one was not even validated — while the
-- same request on a client already registered with `database:read projects:read`
-- produced a token carrying exactly those two. Widening such a provider is
-- therefore a **new registration**, not a new consent through the old client.
--
-- The registration row is keyed by (authorization_server, redirect_uri), so it
-- has to carry the set it was created for: without it the flow cannot tell a
-- cached client that asks for what the row wants from one made for a narrower
-- set, and a member's next consent would silently keep the old grant.
--
-- `''` rather than null is deliberate: the empty set is a real answer ("ask for
-- the provider's default"), and it keeps the upsert's conflict target exact — a
-- nullable column in a unique key compares as distinct, so every re-registration
-- of an unscoped client would have added a row instead of replacing one.
--
-- Rollback:
--
--   alter table public.mcp_oauth_client_registrations drop column scope;
-- ============================================================

alter table public.mcp_oauth_client_registrations
  add column if not exists scope text not null default '';

comment on column public.mcp_oauth_client_registrations.scope is
  'The space-delimited scope set this client was registered for. Empty means it named none and the provider default applies.';
