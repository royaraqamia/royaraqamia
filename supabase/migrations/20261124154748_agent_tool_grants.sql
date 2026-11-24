-- ============================================================
-- Trust is a row, granted per tool (ADR-0180 decisions 2, 3 and 4, #1438)
--
-- A tier-1 tool is reversible, private and ours: recording an expense, ticking
-- a habit. The member may let one of those run inside a turn after they have
-- seen it work, and revoke that trust from the same settings surface. Nothing
-- above tier 1 is grantable, and the executor reads the tier before it reads a
-- grant, so a row that names a tier-2 or tier-3 tool can never make it automatic.
--
-- The row is the member's, one live grant per (user, tool). Revoking sets
-- `revoked_at` rather than deleting: the audit keeps pointing at the grant that
-- caused a run, and a later re-grant is a new row with its own history.
--
-- Only the server creates a grant (`service_role` insert): the tier check and
-- the "seen it run once" precondition live in the grant service, so a signed-in
-- client must not be able to write a row around them. Reading and revoking stay
-- the member's own, through RLS.
--
-- Rollback:
--   alter table public.chat_agent_actions
--     drop column if exists grant_id,
--     drop column if exists tier;
--   drop table if exists public.agent_tool_grants;
--   drop function if exists private.guard_agent_tool_grant();
-- ============================================================

create table if not exists public.agent_tool_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tool_id text not null check (char_length(tool_id) between 1 and 120),
  granted_at timestamptz not null default now(),
  granted_from text not null default 'settings' check (char_length(granted_from) between 1 and 40),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- The live pair: a grant is unique while it is not revoked, and a revoked row
-- does not block a later re-grant.
create unique index if not exists agent_tool_grants_live_pair
  on public.agent_tool_grants (user_id, tool_id)
  where revoked_at is null;

create index if not exists idx_agent_tool_grants_user
  on public.agent_tool_grants (user_id, granted_at desc);

alter table public.agent_tool_grants enable row level security;

drop policy if exists "Members read their tool grants" on public.agent_tool_grants;
create policy "Members read their tool grants"
  on public.agent_tool_grants for select
  using (user_id = auth.uid());

-- No insert policy: a grant is server-created only, after the tier and the
-- "seen it run once" checks. A member moves their own live row to revoked.
drop policy if exists "Members revoke their tool grants" on public.agent_tool_grants;
create policy "Members revoke their tool grants"
  on public.agent_tool_grants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A grant says what it is; only `last_used_at` and `revoked_at` ever move, and
-- a revoked grant stays revoked.
create or replace function private.guard_agent_tool_grant()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a tool grant is history' using errcode = '42501';
  end if;

  if new.user_id <> old.user_id
     or new.tool_id <> old.tool_id
     or new.granted_at <> old.granted_at
     or new.granted_from <> old.granted_from then
    raise exception 'a grant is immutable once written' using errcode = '42501';
  end if;

  if old.revoked_at is not null
     and (new.revoked_at is null or new.revoked_at <> old.revoked_at) then
    raise exception 'a revoked grant stays revoked' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_agent_tool_grant() from public, anon, authenticated;

drop trigger if exists trg_agent_tool_grants_guard on public.agent_tool_grants;
create trigger trg_agent_tool_grants_guard
  before update or delete on public.agent_tool_grants
  for each row execute function private.guard_agent_tool_grant();

grant select, update on public.agent_tool_grants to authenticated;
grant select, insert, update on public.agent_tool_grants to service_role;

-- ------------------------------------------------------------
-- The audit says why a tool ran
-- ------------------------------------------------------------

-- `tier` is the blast radius the registry declared at the time of the run;
-- `grant_id` names the trust that caused it, and is null for a card the member
-- tapped. Both are written once, like the tool and its arguments.
alter table public.chat_agent_actions
  add column if not exists tier smallint check (tier is null or tier between 0 and 3),
  add column if not exists grant_id uuid references public.agent_tool_grants(id) on delete set null;

create index if not exists idx_chat_agent_actions_grant
  on public.chat_agent_actions (grant_id)
  where grant_id is not null;

-- Keep the audit immutable where it already was, and add the two columns that
-- now carry the decision.
create or replace function private.guard_chat_agent_action()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a resolved action is the audit' using errcode = '42501';
  end if;

  if new.conversation_id <> old.conversation_id
     or new.message_id <> old.message_id
     or new.tool <> old.tool
     or new.args <> old.args
     or new.created_at <> old.created_at
     or new.tier is distinct from old.tier
     or new.grant_id is distinct from old.grant_id then
    raise exception 'a proposal is immutable once written' using errcode = '42501';
  end if;

  if not (
    new.status = old.status
    or (old.status = 'proposed' and new.status in ('confirmed', 'rejected'))
    or (old.status = 'confirmed' and new.status in ('applied', 'failed'))
  ) then
    raise exception 'action already resolved' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_chat_agent_action() from public, anon, authenticated;
