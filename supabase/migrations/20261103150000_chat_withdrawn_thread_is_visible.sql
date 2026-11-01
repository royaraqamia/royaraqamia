-- A withdrawn thread still belongs to the pair that had it
--
-- Withdrawing a request leaves both roster rows as `left` (that is what makes it
-- disappear from both inboxes). The row-visibility helper asked for a status in
-- (requested, invited, active, declined), so the peer who had the request
-- withdrawn could no longer see the conversation they had been invited to — the
-- pair lookup answered "no thread", the picker tried to open a second one, and
-- the pair's unique index refused it with a 500.
--
-- `left` now counts for *visibility* only: the list still filters it out
-- (`list_chat_threads` reads my row's status), messages still need
-- `chat_is_participant` (active), so an ex-participant can reopen the thread and
-- nothing else.
--
-- Rollback: restore the definition from 20261103090000_chats.sql.

create or replace function private.chat_has_conversation_access(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
      from public.chat_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = p_user_id
       and p.status in ('requested', 'invited', 'active', 'declined', 'left')
  );
$$;

revoke all on function private.chat_has_conversation_access(uuid, uuid) from public, anon;
grant execute on function private.chat_has_conversation_access(uuid, uuid) to authenticated;
