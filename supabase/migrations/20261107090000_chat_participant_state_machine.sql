-- A participant row is a state machine, and the database is the boundary
--
-- ADR-0113 makes consent a participant status and treats `declined` and `left`
-- as terminal. Three live policies did not enforce that, and all three were
-- reachable with the publishable key and a signed-in JWT against
-- `/rest/v1/chat_participants` - the UI never had to expose them:
--
-- - the insert policy let any active member of any thread add another user as
--   `requested`/`invited`. In a direct thread either member could add a third
--   account: the status trigger then moved the conversation to `requested`, so
--   `chat_is_participant` went false for both original members, and if the
--   third account accepted it read the whole history and the pair key became a
--   three-person key;
-- - the update policy only checked `user_id = auth.uid()`. A participant could
--   set their own status to anything: `active` -> `requested` froze the thread
--   for both sides, `declined`/`left` -> `active` rejoined without consent and
--   undid a decline, and `role`/`invited_by` were writable too;
-- - the delete policy plus the table-level grant let a member hard-delete their
--   roster row, which is the row `chat_direct_key` derives the pair from.
--
-- This migration closes all three:
--
-- 1. `Members add a participant` asks a helper, so the branches are one
--    expression the database evaluates: the creator joins the thread they
--    opened; the creator of a direct thread asks exactly one peer while nobody
--    else is in it; a member of a group asks or invites. No branch admits a
--    second member to a direct thread or anyone else to an agent thread.
-- 2. `private.guard_chat_participant_state` makes the update a state machine:
--    requested/invited -> active/declined/left, active -> left, and a
--    `last_read_at`-only write at any status. `declined`/`left` are terminal
--    for clients; the SECURITY DEFINER `request_chat_conversation` and
--    `withdraw_chat_request` reopen a thread as the table owner, which is the
--    one caller the guard admits. Identity columns and `role`/`invited_by` are
--    never the client's to write, and `joined_at` moves only with a legal
--    status change.
-- 3. `delete` is revoked from `authenticated` and the delete policy is dropped.
--    Nothing is hard-deleted (ADR-0113); leaving is an update. Cascades from
--    `users` and `service_role` writes are unaffected.
--
-- Rollback:
--   drop trigger if exists trg_chat_participant_guard on public.chat_participants;
--   drop function if exists private.guard_chat_participant_state();
--   drop function if exists private.chat_may_add_participant(uuid, uuid, uuid, text);
--   grant delete on public.chat_participants to authenticated;
--   (then restore the insert and delete policies from
--    20261103120000_chat_creator_opens_the_thread.sql and 20261103090000_chats.sql)

-- ------------------------------------------------------------
-- Who may add a participant, and as what
-- ------------------------------------------------------------
--
-- One SECURITY DEFINER helper rather than a policy that reads
-- `chat_participants` from inside `chat_participants`: the roster lookup has to
-- see every row, including the ones the caller's own policies would hide.
create or replace function private.chat_may_add_participant(
  p_conversation_id uuid,
  p_user_id uuid,
  p_target_id uuid,
  p_status text
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
      from public.chat_conversations c
     where c.id = p_conversation_id
       and (
         -- The creator joins the thread they just opened.
         (
           p_target_id = p_user_id
           and p_status = 'active'
           and c.created_by = p_user_id
         )
         -- The creator of a direct thread asks their one peer, and only while
         -- the thread holds nobody but the creator. A second add here would
         -- make it a three-person direct thread and corrupt the pair key.
         or (
           c.kind = 'direct'
           and c.created_by = p_user_id
           and p_target_id <> p_user_id
           and p_status = 'requested'
           and not exists (
             select 1
               from public.chat_participants p
              where p.conversation_id = p_conversation_id
                and p.user_id <> p_user_id
           )
         )
         -- A member of a group adds a request or an invite. The group cap
         -- belongs to the groups work, not here.
         or (
           c.kind = 'group'
           and p_target_id <> p_user_id
           and p_status in ('requested', 'invited')
           and exists (
             select 1
               from public.chat_participants p
              where p.conversation_id = p_conversation_id
                and p.user_id = p_user_id
                and p.status = 'active'
           )
         )
       )
  );
$$;

revoke all on function private.chat_may_add_participant(uuid, uuid, uuid, text)
  from public, anon, authenticated;

drop policy if exists "Members add a participant" on public.chat_participants;
create policy "Members add a participant"
  on public.chat_participants for insert
  to authenticated
  with check (
    private.chat_may_add_participant(
      conversation_id,
      (select auth.uid()),
      user_id,
      status
    )
  );

-- ------------------------------------------------------------
-- The state machine
-- ------------------------------------------------------------
--
-- A client may answer a request (requested/invited -> active, declined or
-- left) and leave an active thread (active -> left). `declined` and `left` are
-- terminal for clients: the SECURITY DEFINER lifecycle functions run as the
-- table owner and are the only caller allowed to reopen one.
--
-- `last_read_at` is the watermark and moves at any status, on its own. The
-- identity columns and `role`/`invited_by` are never a client's to write, and
-- `joined_at` only travels with a legal status change, which is how the
-- lifecycle functions stamp and clear it.
create or replace function private.guard_chat_participant_state()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  v_owner name;
begin
  if new.user_id is distinct from old.user_id
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at
     or new.role is distinct from old.role
     or new.invited_by is distinct from old.invited_by then
    raise exception 'a participant keeps its identity' using errcode = '42501';
  end if;

  -- The table owner is the SECURITY DEFINER lifecycle functions; a client is
  -- never the owner, so this is what separates "the server reopened it" from
  -- "a member rewrote their own row".
  select pg_get_userbyid(c.relowner)
    into v_owner
    from pg_class c
   where c.oid = 'public.chat_participants'::regclass;

  if new.status is not distinct from old.status then
    if new.joined_at is distinct from old.joined_at
       and current_user is distinct from v_owner then
      raise exception 'joined_at moves with a status change' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status in ('declined', 'left') then
    if current_user is distinct from v_owner then
      raise exception 'a closed participant stays closed' using errcode = '42501';
    end if;

    return new;
  end if;

  if old.status in ('requested', 'invited')
     and new.status in ('active', 'declined', 'left') then
    return new;
  end if;

  if old.status = 'active' and new.status = 'left' then
    return new;
  end if;

  raise exception 'a participant status cannot move that way' using errcode = '42501';
end;
$$;

revoke all on function private.guard_chat_participant_state() from public, anon, authenticated;

drop trigger if exists trg_chat_participant_guard on public.chat_participants;
create trigger trg_chat_participant_guard
  before update on public.chat_participants
  for each row execute function private.guard_chat_participant_state();

-- ------------------------------------------------------------
-- Nothing is hard-deleted
-- ------------------------------------------------------------

drop policy if exists "A participant removes themselves" on public.chat_participants;

revoke delete on public.chat_participants from authenticated;
