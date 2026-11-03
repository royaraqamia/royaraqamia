-- Leaving a thread does not leave its roster readable
--
-- `20261103150000_chat_withdrawn_thread_is_visible.sql` put `left` into
-- `private.chat_has_conversation_access` so a withdrawn direct thread can still
-- be found and reopened. That helper is the SELECT predicate of two policies:
-- `"Members read their conversations"`, which is what `ChatService.preview`
-- needs to resolve the pair's id, and `"Members read the roster"`, which it is
-- not. A member who left a group, or declined an invitation, could read every
-- peer's `chat_participants` row of that thread: names, statuses and each
-- peer's `last_read_at`.
--
-- The two reads are split here:
--
-- - `chat_has_conversation_access` keeps `left` and stays the conversations
--   predicate, so the preview path still finds a closed thread.
-- - `private.chat_roster_visible` answers for requested/invited/active/declined
--   only, never `left`, and becomes the roster predicate. The caller's own row
--   stays readable through its own branch of the policy, which is what lets a
--   `left` member read — and stamp a watermark on — their own row and nothing
--   else.
--
-- `ChatService.reopen` found its peer through the roster, which the new policy
-- answers with the caller's row alone for a `left` caller, and every reopen
-- would have thrown 403. `public.chat_direct_peer` is the narrow read it needs
-- instead: the one id on the other side of a two-row direct thread, and never
-- another member's row. It is in `public` because the caller's own client
-- reaches it through PostgREST's `rpc`.
--
-- Messages, attachments and the typing channel are untouched: they ask
-- `private.chat_is_participant` (active), so a `left` or `declined` row still
-- reads none of them.
--
-- Rollback:
--   restore "Members read the roster" from 20261103090000_chats.sql;
--   drop function if exists public.chat_direct_peer(uuid);
--   drop function if exists private.chat_roster_visible(uuid, uuid);

-- ------------------------------------------------------------
-- The roster's own predicate: every answer but `left`
-- ------------------------------------------------------------

create or replace function private.chat_roster_visible(
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
       and p.status in ('requested', 'invited', 'active', 'declined')
  );
$$;

revoke all on function private.chat_roster_visible(uuid, uuid) from public, anon, authenticated;
grant execute on function private.chat_roster_visible(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- The roster policy: peers need a row that has not left
-- ------------------------------------------------------------

drop policy if exists "Members read the roster" on public.chat_participants;
create policy "Members read the roster"
  on public.chat_participants for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.chat_roster_visible(conversation_id, (select auth.uid()))
  );

-- ------------------------------------------------------------
-- Reopening needs the peer's id, and nothing else about them
-- ------------------------------------------------------------

create or replace function public.chat_direct_peer(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = 'public'
as $$
  select peer.user_id
    from public.chat_participants me
    join public.chat_participants peer
      on peer.conversation_id = me.conversation_id
     and peer.user_id <> me.user_id
    join public.chat_conversations c
      on c.id = me.conversation_id
     and c.kind = 'direct'
   where me.conversation_id = p_conversation_id
     and me.user_id = (select auth.uid())
     and (
       select count(*)
         from public.chat_participants n
        where n.conversation_id = p_conversation_id
     ) = 2;
$$;

revoke all on function public.chat_direct_peer(uuid) from public, anon;
grant execute on function public.chat_direct_peer(uuid) to authenticated;
