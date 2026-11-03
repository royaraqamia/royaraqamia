-- ============================================================
-- The assistant proposes, the member confirms (ADR-0113, #818)
--
-- A model may suggest a write; only the member may perform one. The suggestion
-- is a row here, drawn in the thread as a card, and the write runs when the
-- member's own request confirms it — on the member's own session, through the
-- product's own service, so the policy that would refuse the action refuses it
-- here too.
--
-- The row *is* the audit: which tool, which arguments, who confirmed, what the
-- service answered. It is therefore:
--
--   inserted  by the server only (a proposal is the model's output, and the
--             client must not be able to forge one),
--   read      by the conversation's members (RLS, `chat_is_participant`),
--   resolved  once, by the member, from `proposed` to `rejected` or
--             `confirmed` and from `confirmed` to `applied` or `failed`,
--   and never deleted or rewritten (`guard_chat_agent_action`).
--
-- The two-step `proposed` -> `confirmed` -> `applied` is what makes a double tap
-- and a replayed request do nothing: the claim is a compare-and-set on a row
-- that is still `proposed`, so exactly one request runs the tool.
--
-- Rollback:
--   drop table if exists public.chat_agent_actions;
--   drop function if exists private.guard_chat_agent_action();
-- ============================================================

create table if not exists public.chat_agent_actions (
  id uuid primary key default gen_random_uuid(),
  -- `restrict`, not `cascade`: a proposal is the audit, so the message and the
  -- thread it belongs to cannot be hard-deleted out from under it (messages are
  -- tombstoned rather than deleted, so no product path wants to).
  conversation_id uuid not null references public.chat_conversations(id) on delete restrict,
  message_id uuid not null references public.chat_messages(id) on delete restrict,
  tool text not null check (char_length(tool) between 1 and 60),
  args jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'rejected', 'applied', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null
);

create index if not exists idx_chat_agent_actions_conversation
  on public.chat_agent_actions (conversation_id, created_at);

create index if not exists idx_chat_agent_actions_message
  on public.chat_agent_actions (message_id);

-- ------------------------------------------------------------
-- The row is the record
-- ------------------------------------------------------------

-- What a row may become is fixed, and what it says never changes after it is
-- written. The database refuses a replayed confirmation, a rewritten argument,
-- and a deleted audit — a route that forgot to check cannot undo it.
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
     or new.created_at <> old.created_at then
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

drop trigger if exists trg_chat_agent_actions_guard on public.chat_agent_actions;
create trigger trg_chat_agent_actions_guard
  before update or delete on public.chat_agent_actions
  for each row execute function private.guard_chat_agent_action();

-- ------------------------------------------------------------
-- Who reads and who resolves
-- ------------------------------------------------------------

alter table public.chat_agent_actions enable row level security;

drop policy if exists "Members read their proposals" on public.chat_agent_actions;
create policy "Members read their proposals"
  on public.chat_agent_actions for select
  using (private.chat_is_participant(conversation_id, auth.uid()));

-- No insert policy: a proposal is the model's output, written by the server
-- with the service role. A member can only move a row their own confirmation
-- claimed, and only out of a state that still allows a move.
drop policy if exists "Members resolve their proposals" on public.chat_agent_actions;
create policy "Members resolve their proposals"
  on public.chat_agent_actions for update
  using (
    private.chat_is_participant(conversation_id, auth.uid())
    and (
      status = 'proposed'
      or (status = 'confirmed' and resolved_by = auth.uid())
    )
  )
  with check (
    private.chat_is_participant(conversation_id, auth.uid())
    and resolved_by = auth.uid()
  );

grant select, update on public.chat_agent_actions to authenticated;
grant select, insert, update on public.chat_agent_actions to service_role;
