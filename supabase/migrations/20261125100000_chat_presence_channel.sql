-- ============================================================
-- Presence is a private per-member channel (ADR-0165)
--
-- A typing or recording event is meaningless seconds later, so it is never
-- stored (ADR-0113, ADR-0116). The old topic was per conversation, which meant
-- the chats list had to join one channel per row before it could draw anything.
-- The messenger shape is one stream per member: the reader joins
-- `presence:<their id>`, and a peer who is writing publishes into it, carrying
-- the conversation the state belongs to.
--
-- The topic is a boundary because it is **private**, authorised by RLS on
-- `realtime.messages`:
--
--   * `select` names the owner alone, so a peer can never read a stream it is
--     not the recipient of;
--   * `insert` names a member who shares an **active direct conversation** with
--     the owner, so presence cannot be sprayed at a stranger.
--
-- Realtime lets a channel join when the member has at least one read *or* write
-- permission on the topic, so a sender joins the peer's topic write-only: the
-- join is admitted by the insert policy, and the absent select policy is why it
-- receives nothing back.
--
-- The topic is `presence:<user uuid>`. Realtime hands the policy the raw topic
-- string and RLS may not raise on a malformed one, so it is parsed by
-- `private.chat_presence_owner`, which answers null for anything else.
--
-- The previous `chat:<conversation id>` policies are left in place for one
-- deploy: a tab opened before this migration is still publishing there, and a
-- dead topic costs nothing. They can be dropped once no old client remains.
--
-- Rollback:
--   drop policy if exists "A member receives their own presence" on realtime.messages;
--   drop policy if exists "A peer announces into a presence stream" on realtime.messages;
--   drop function if exists private.chat_may_announce_presence(uuid, uuid);
--   drop function if exists private.chat_presence_owner(text);
-- ============================================================

-- ------------------------------------------------------------
-- The topic, parsed into the member it belongs to
-- ------------------------------------------------------------

create or replace function private.chat_presence_owner(p_topic text)
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

revoke all on function private.chat_presence_owner(text) from public, anon;
-- A policy expression runs with the privileges of the caller, so the role that
-- queries `realtime.messages` needs EXECUTE on the helper it names (#811).
grant execute on function private.chat_presence_owner(text) to authenticated;

comment on function private.chat_presence_owner(text) is
  'The member a Realtime presence topic belongs to, or null when it is not presence:<uuid> (ADR-0165).';

-- ------------------------------------------------------------
-- Who may write into whose stream
-- ------------------------------------------------------------

-- The two members must be active in the same direct conversation, and the
-- conversation itself active: a request that was declined, a thread that was
-- archived or a block that ended it announces nothing. The check is SECURITY
-- DEFINER because it reads both participant rows, and both helpers in
-- `private` are revoked from every client role for the same reason.
create or replace function private.chat_may_announce_presence(
  p_owner uuid,
  p_sender uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is not null
     and p_sender is not null
     and p_owner <> p_sender
     and exists (
       select 1
         from public.chat_conversations c
         join public.chat_participants owner
           on owner.conversation_id = c.id
          and owner.user_id = p_owner
          and owner.status = 'active'
         join public.chat_participants sender
           on sender.conversation_id = c.id
          and sender.user_id = p_sender
          and sender.status = 'active'
        where c.kind = 'direct'
          and c.status = 'active'
     );
$$;

revoke all on function private.chat_may_announce_presence(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.chat_may_announce_presence(uuid, uuid) to authenticated;

comment on function private.chat_may_announce_presence(uuid, uuid) is
  'Whether one member may publish presence into the other''s stream (ADR-0165).';

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
  execute $policy$
    create policy "A member receives their own presence"
      on realtime.messages for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and private.chat_presence_owner((select realtime.topic())) = (select auth.uid())
      )
  $policy$;

  execute 'drop policy if exists "A peer announces into a presence stream" on realtime.messages';
  execute $policy$
    create policy "A peer announces into a presence stream"
      on realtime.messages for insert
      to authenticated
      with check (
        realtime.messages.extension = 'broadcast'
        and private.chat_may_announce_presence(
          private.chat_presence_owner((select realtime.topic())),
          (select auth.uid())
        )
      )
  $policy$;
end $$;
