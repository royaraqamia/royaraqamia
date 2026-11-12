-- ============================================================
-- Presence is a private per-conversation channel (ADR-0167)
--
-- A typing or recording event is meaningless seconds later, so it is never
-- stored (ADR-0113, ADR-0116). ADR-0165 put it on a per-member stream,
-- `presence:<user id>`, and assumed a sender could join the peer's stream
-- **write-only**, admitted by the insert policy. Realtime does not admit that:
-- a private channel is authorised on JOIN against the `select` policy alone, so
-- the sender's join was refused ("You do not have permissions to read from this
-- Channel topic") and every keystroke stayed in the client's queue.
--
-- The topic is therefore the conversation itself, `presence:<conversation id>`,
-- which is the unit the state belongs to: both members join it, both hear the
-- other, and the policies name an **active member of an active direct thread**
-- for reading and writing alike. Nothing is exposed beyond the pair, which is
-- the property the per-member stream was trying to keep.
--
-- A member hears every event on the topic, including their own; clients drop
-- their own by the payload's `userId` (ADR-0116 keeps that cosmetic), and the
-- topic is small enough that there is nobody else to hear.
--
-- The previous `presence:<user id>` policies are dropped. The older
-- `chat:<conversation id>` typing policies stay, dead, for the same reason the
-- previous migration left them: a tab opened before this deploy may still be
-- publishing there, and an unused topic costs nothing.
--
-- Rollback:
--   drop policy if exists "A thread's members hear its presence" on realtime.messages;
--   drop policy if exists "A thread's members announce their presence" on realtime.messages;
--   drop function if exists private.chat_can_hear_presence(uuid, uuid);
--   drop function if exists private.chat_presence_thread(text);
--   (then re-apply 20261125100000_chat_presence_channel.sql)
-- ============================================================

-- ------------------------------------------------------------
-- The topic, parsed into the conversation it belongs to
-- ------------------------------------------------------------

create or replace function private.chat_presence_thread(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~* '^presence:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_topic, ':', 2)::uuid
    else null
  end;
$$;

revoke all on function private.chat_presence_thread(text) from public, anon;
-- A policy expression runs with the privileges of the caller, so the role that
-- queries `realtime.messages` needs EXECUTE on the helper it names (#811).
grant execute on function private.chat_presence_thread(text) to authenticated;

comment on function private.chat_presence_thread(text) is
  'The conversation a Realtime presence topic belongs to, or null when it is not presence:<uuid> (ADR-0167).';

-- ------------------------------------------------------------
-- Who may join it
-- ------------------------------------------------------------

-- Reading and writing are the same question now: the member must be active in
-- the thread, and the thread itself active and direct. SECURITY DEFINER because
-- it reads the conversation and the participant row together, and both helpers
-- in `private` are revoked from every client role for the same reason.
create or replace function private.chat_can_hear_presence(
  p_thread uuid,
  p_member uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_thread is not null
     and p_member is not null
     and exists (
       select 1
         from public.chat_conversations c
         join public.chat_participants me
           on me.conversation_id = c.id
          and me.user_id = p_member
          and me.status = 'active'
        where c.id = p_thread
          and c.kind = 'direct'
          and c.status = 'active'
     );
$$;

revoke all on function private.chat_can_hear_presence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.chat_can_hear_presence(uuid, uuid) to authenticated;

comment on function private.chat_can_hear_presence(uuid, uuid) is
  'Whether a member may join a conversation''s presence topic (ADR-0167).';

-- ------------------------------------------------------------
-- Realtime authorisation
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages is not in this database; skipping the presence channel policies';
    return;
  end if;

  execute 'drop policy if exists "A member receives their own presence" on realtime.messages';
  execute 'drop policy if exists "A peer announces into a presence stream" on realtime.messages';

  execute 'drop policy if exists "A thread''s members hear its presence" on realtime.messages';
  execute $policy$
    create policy "A thread's members hear its presence"
      on realtime.messages for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and private.chat_can_hear_presence(
          private.chat_presence_thread((select realtime.topic())),
          (select auth.uid())
        )
      )
  $policy$;

  execute 'drop policy if exists "A thread''s members announce their presence" on realtime.messages';
  execute $policy$
    create policy "A thread's members announce their presence"
      on realtime.messages for insert
      to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and private.chat_can_hear_presence(
          private.chat_presence_thread((select realtime.topic())),
          (select auth.uid())
        )
      )
  $policy$;
end $$;

-- The per-member stream's helpers have no policy left to serve.
drop function if exists private.chat_may_announce_presence(uuid, uuid);
drop function if exists private.chat_presence_owner(text);
