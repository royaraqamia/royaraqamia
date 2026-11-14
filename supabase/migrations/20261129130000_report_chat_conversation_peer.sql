-- A report may only name a member of the conversation it is filed in (#1378).
--
-- `public.report_chat_conversation` is the one writer of `public.chat_reports`
-- (#886) and its comment says the reported side is resolved here. It was not:
-- the caller's `p_reported_user_id` was copied straight into the row, and the
-- only value the function refused was the caller themselves. A member could
-- therefore file a report on a conversation they are in and name any account at
-- all, and the admin queue labels that account as the reported side and
-- highlights its messages, steering moderation at an innocent member.
--
-- The reported side is now resolved against `public.chat_participants`:
--
--   * a supplied id must be an active participant of this conversation, and
--     still cannot be the caller, or the call is refused with `22023` and
--     writes nothing;
--   * a null id on a direct thread stores the other active participant, so a
--     client that names nobody still files a report that names the peer;
--   * a null id on a group (or agent) thread stays null.
--
-- The reporter, the reason, the snapshot, the return type and the grants are
-- unchanged.
--
-- Rollback:
--   re-apply the definition in `20261103090000_chats.sql`.

create or replace function public.report_chat_conversation(
  p_conversation_id uuid,
  p_reason text,
  p_reported_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_id       uuid;
  v_reported uuid := p_reported_user_id;
  v_kind     text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not private.chat_is_participant(p_conversation_id, v_uid) then
    raise exception 'not a member of this conversation' using errcode = '42501';
  end if;

  if v_reported is not null and v_reported = v_uid then
    raise exception 'a report names the other side' using errcode = '22023';
  end if;

  if v_reported is not null
     and not exists (
       select 1
         from public.chat_participants p
        where p.conversation_id = p_conversation_id
          and p.user_id = v_reported
          and p.status = 'active'
     ) then
    raise exception 'a report names a member of this conversation' using errcode = '22023';
  end if;

  if v_reported is null then
    select c.kind into v_kind
      from public.chat_conversations c
     where c.id = p_conversation_id;

    if v_kind = 'direct' then
      select p.user_id into v_reported
        from public.chat_participants p
       where p.conversation_id = p_conversation_id
         and p.status = 'active'
         and p.user_id <> v_uid
       limit 1;
    end if;
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'a report carries a reason' using errcode = '22023';
  end if;

  insert into public.chat_reports (
    conversation_id, reporter_id, reported_user_id, reason, snapshot
  ) values (
    p_conversation_id,
    v_uid,
    v_reported,
    btrim(p_reason),
    private.chat_thread_snapshot(p_conversation_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.report_chat_conversation(uuid, text, uuid) from public, anon;
grant execute on function public.report_chat_conversation(uuid, text, uuid) to authenticated;

comment on function public.report_chat_conversation(uuid, text, uuid) is
  'The one writer of chat_reports (#886, #1378): the reporter is auth.uid(), the reason is trimmed and bounded, the reported side is resolved here - a supplied id must be an active participant of the conversation, a null id on a direct thread stores the other participant - and the snapshot is frozen from the thread.';
