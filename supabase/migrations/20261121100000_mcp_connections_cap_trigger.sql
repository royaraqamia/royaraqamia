-- The connected-app cap, enforced where the outbound row is written (#1266).
--
-- `mcp_connected_apps` is one pool for both directions (ADR-0155): the inbound
-- half counts distinct live OAuth clients, and the outbound half counts the
-- member's `mcp_connections` rows that are not `revoked` — both inside
-- `private.owned_item_count`, which the plan gate reads. Every other capped
-- table also carries `private.enforce_owned_item_cap`, so a write that goes
-- around the service (a concurrent consent callback, a direct insert with the
-- service role) is refused by Postgres. This table was the one without the
-- trigger, so the cap held only from the application: two flows started under
-- the same last free slot could both settle.
--
-- The application checks are not replaced. `start` still refuses before the
-- browser leaves, with the sentence the member reads, and `complete` asks again
-- when the consent comes back, because the slot can be spent in between. This
-- is the write's own refusal underneath both.
--
-- ADR-0093 ("a cap is enforced at create"), ADR-0155 (one pool, both
-- directions).

-- A connection is live unless it is revoked, and a revoked row frees its slot in
-- `private.owned_item_count` — so writing one must not be refused at the cap.
-- Without this branch the fallthrough would read the row as live: a row without
-- `deleted_at` is active by default, and that column does not exist here.
--
-- The rest of the body is `20261109090000_chat_groups.sql` unchanged.
create or replace function private.owned_item_is_active(p_item text, p_row jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_row is null then false
    when p_item = 'community_published' then
      (p_row ->> 'deleted_at') is null and (p_row ->> 'status') = 'published'
    when p_item = 'community_drafts' then
      (p_row ->> 'deleted_at') is null
      and (p_row ->> 'status') in ('draft', 'scheduled')
    when p_item in ('community_tags', 'community_categories') then true
    when p_item = 'chat_groups' then (p_row ->> 'kind') = 'group'
    when p_item = 'mcp_connected_apps' then (p_row ->> 'status') is distinct from 'revoked'
    else (p_row ->> 'deleted_at') is null
  end
$$;

revoke all on function private.owned_item_is_active(text, jsonb) from public, anon, authenticated;

-- `insert or update`, like every other capped table: one trigger per table, and
-- no second definition to drift. On an update the shared function takes no new
-- slot — it treats a row without `deleted_at` as already live — and that is the
-- truth here too: `disconnect` deletes the row rather than revoking it, so
-- nothing in the product revives one. The load-bearing half is the insert.
drop trigger if exists enforce_plan_cap on public.mcp_connections;
create trigger enforce_plan_cap
  before insert or update on public.mcp_connections
  for each row execute function private.enforce_owned_item_cap('mcp_connected_apps', 'user_id');

-- rollback:
--   drop trigger if exists enforce_plan_cap on public.mcp_connections;
--   (the `owned_item_is_active` branch is harmless without the trigger and can
--   stay; dropping it means re-creating the 20261109090000 body without the
--   `mcp_connected_apps` line)
