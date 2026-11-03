-- One assistant thread per member is enforced at the boundary (#890)
--
-- `ChatService.startAssistant` read the member's threads and, when none was
-- `kind = 'agent'`, inserted a conversation and its owner participant. The read
-- and the insert are two round trips, so two concurrent opens (two tabs, a
-- retried POST, two devices) both read nothing and both inserted: two identical
-- «المساعد الذكي» rows for one account. Sequentially the route kept answering
-- the first, so the duplicates stayed in the list. A POST loop could also grow
-- them without bound, because only a group takes a `chat_groups` slot.
--
-- The direct pair has `chat_direct_key_idx`; an agent thread cannot use a
-- unique index, because one would refuse to be created while the duplicates
-- already stored are still there, and deleting or merging them is a non-goal.
-- A `before insert` trigger states the same invariant without touching a row
-- that already exists (ADR-0113).
--
-- The advisory lock is what makes the check hold under concurrency: it is keyed
-- on the member and held until the transaction ends, so a second insert waits
-- for the first to commit and then sees its row. Without it two inserts in
-- flight can each read no row and both pass, which is the bug this fixes.
--
-- The refusal is `23505`, the code `chat_direct_key_idx` raises, so the
-- repository maps both conflicts the same way and the service answers with the
-- thread that already exists instead of a failure.
--
-- Rollback:
--   drop trigger if exists trg_chat_conversations_one_agent_thread on public.chat_conversations;
--   drop function if exists private.enforce_one_agent_thread();

-- ------------------------------------------------------------
-- The invariant: one agent conversation per creator
-- ------------------------------------------------------------

create or replace function private.enforce_one_agent_thread()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- Only the assistant's thread is unique per member. A direct pair is the
  -- index's, and a group is deliberately many.
  if new.kind <> 'agent' then
    return new;
  end if;

  -- One lock per member, taken before the check, so the check and the insert it
  -- guards run under the same lock — the shape
  -- `private.enforce_chat_thread_size` uses per conversation.
  perform pg_advisory_xact_lock(
    hashtextextended('chat:agent:' || new.created_by::text, 0)
  );

  if exists (
    select 1
      from public.chat_conversations c
     where c.kind = 'agent'
       and c.created_by = new.created_by
  ) then
    raise exception 'a member already has an assistant thread'
      using errcode = '23505',
            detail = new.created_by::text,
            hint = 'read the existing agent conversation';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_one_agent_thread() from public, anon, authenticated;

drop trigger if exists trg_chat_conversations_one_agent_thread on public.chat_conversations;
create trigger trg_chat_conversations_one_agent_thread
  before insert on public.chat_conversations
  for each row execute function private.enforce_one_agent_thread();
