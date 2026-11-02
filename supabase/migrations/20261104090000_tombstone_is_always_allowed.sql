-- ============================================================
-- A tombstone is always allowed; fifteen minutes bounds the edit (ADR-0113)
--
-- 20261103090000_chats.sql put the window in the RLS UPDATE policy, so it also
-- gated the tombstone: a delete on a message older than fifteen minutes matched
-- zero rows, PostgREST answered without an error, and the client reported a
-- success that a refresh undid (#843). ADR-0113 bounds an *edit* in time; a
-- member may delete what they wrote whenever they like.
--
-- The window moves into `private.guard_chat_message_columns`, which sees both
-- the old and the new row. The guard also keeps the tombstone final and refuses
-- a body that survives it, so the policy can stay a plain "my row" rule:
--
--   * a body change after fifteen minutes  -> 42501, the service answers 403
--   * `deleted_at` set at any age          -> allowed, body cleared in the same
--                                             write, `edited_at` untouched
--   * a body change on a tombstoned row    -> 42501
--
-- Rollback: recreate the policy and the guard as they stand in
-- 20261103090000_chats.sql.
-- ============================================================

create or replace function private.guard_chat_message_columns()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.conversation_id <> old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.sender_kind <> old.sender_kind
     or new.created_at <> old.created_at
     or new.reply_to_id is distinct from old.reply_to_id then
    raise exception 'a message keeps its identity' using errcode = '42501';
  end if;

  -- `deleted_at` is what the guard says most about, so it answers first and
  -- leaves without looking at the clock.
  if old.deleted_at is not null then
    if new.deleted_at is null or new.body is not null then
      raise exception 'a deleted message stays deleted' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.deleted_at is not null then
    -- The tombstone clears the body in the same write; that is not an edit, so
    -- it is not windowed and it does not stamp `edited_at`.
    new.body := null;
    new.edited_at := old.edited_at;
    return new;
  end if;

  if new.body is distinct from old.body then
    if old.created_at <= now() - interval '15 minutes' then
      raise exception 'a message is edited within fifteen minutes' using errcode = '42501';
    end if;

    new.edited_at := now();
  end if;

  return new;
end;
$$;

revoke all on function private.guard_chat_message_columns() from public, anon, authenticated;

-- The RLS rule is identity only: the window above is the one place that decides
-- age, so this policy cannot drift away from it. `deleted_at is null` keeps a
-- second tombstone a no-op the repository reports as "no row changed".
drop policy if exists "Members edit their own messages" on public.chat_messages;
create policy "Members edit their own messages"
  on public.chat_messages for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and deleted_at is null
  )
  with check ( sender_id = (select auth.uid()) );
