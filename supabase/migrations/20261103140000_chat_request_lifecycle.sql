-- A request can be withdrawn, and a closed thread can be asked for again
--
-- A direct thread is unique per pair, so neither "I changed my mind" nor "ask
-- again after a refusal" can be a second conversation. Both are a move on the
-- same thread, and both have to write the *other* side's roster row — which a
-- participant may not touch under RLS (`"A participant answers for themselves"`
-- allows only your own row). They are therefore security-definer functions, the
-- same shape as `report_chat_conversation`:
--
-- - withdraw_chat_request: the requester closes the thread and both rows leave
--   the roster, so it disappears from both inboxes instead of leaving the peer
--   a request nobody is waiting on. A withdrawn pair can open a request again
--   through the same function that reopens a declined one.
-- - request_chat_conversation: either side of a closed thread (declined or
--   withdrawn) puts it back to a request — caller active, counterpart
--   requested. It answers `false` when the thread is already open, so the
--   service can tell "opened it" from "it was already there" and only notify on
--   the former. The participants trigger derives the conversation status.
--
-- Rollback:
--   drop function if exists public.withdraw_chat_request(uuid);
--   drop function if exists public.request_chat_conversation(uuid);
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   (then restore the constraint from 20260925133838 and the request/withdraw routes)

-- ------------------------------------------------------------
-- The request notification type
-- ------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'certificate_issued',
      'post_published',
      'habit_reminder',
      'recovery_nudge',
      'expense_alert',
      'link_clicked',
      'system_announcement',
      'training_application',
      'consultation_booking',
      'project_request',
      'retainer_request',
      'chat_request'
    ));

-- ------------------------------------------------------------
-- Withdraw: the requester takes the thread back
-- ------------------------------------------------------------

create or replace function public.withdraw_chat_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_kind        text;
  v_my_status   text;
  v_peer_status text;
begin
  if v_uid is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select c.kind into v_kind
    from public.chat_conversations c
   where c.id = p_conversation_id;

  if v_kind is distinct from 'direct' then
    raise exception 'لا يمكن إلغاء طلب هذه المحادثة';
  end if;

  select p.status into v_my_status
    from public.chat_participants p
   where p.conversation_id = p_conversation_id
     and p.user_id = v_uid;

  if v_my_status is distinct from 'active' then
    raise exception 'لا يمكنك إلغاء طلب لم ترسله';
  end if;

  select p.status into v_peer_status
    from public.chat_participants p
   where p.conversation_id = p_conversation_id
     and p.user_id <> v_uid;

  if v_peer_status is distinct from 'requested' then
    raise exception 'لم يعد هذا الطلب بانتظار رد';
  end if;

  -- Both rows leave the roster in one statement; the participants trigger then
  -- derives `archived`, and neither side lists a thread nobody is in.
  update public.chat_participants
     set status = 'left',
         joined_at = null
   where conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.withdraw_chat_request(uuid) from public, anon;
grant execute on function public.withdraw_chat_request(uuid) to authenticated;

-- ------------------------------------------------------------
-- Request again: a closed thread goes back to waiting
-- ------------------------------------------------------------

create or replace function public.request_chat_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_kind   text;
  v_status text;
  v_peer   uuid;
begin
  if v_uid is null then
    raise exception 'يلزم تسجيل الدخول';
  end if;

  select c.kind, c.status into v_kind, v_status
    from public.chat_conversations c
   where c.id = p_conversation_id;

  if v_kind is distinct from 'direct' then
    raise exception 'هذه المحادثة ليست محادثة مباشرة';
  end if;

  select p.user_id into v_peer
    from public.chat_participants p
   where p.conversation_id = p_conversation_id
     and p.user_id <> v_uid;

  -- Not a participant, or the only participant: nothing to ask.
  if v_peer is null then
    return false;
  end if;

  if not exists (
    select 1
      from public.chat_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id = v_uid
  ) then
    return false;
  end if;

  -- Already open: the caller only wanted to reach the thread it has.
  if v_status not in ('declined', 'archived') then
    return false;
  end if;

  update public.chat_participants
     set status = case when user_id = v_uid then 'active' else 'requested' end,
         joined_at = case when user_id = v_uid then now() else null end
   where conversation_id = p_conversation_id;

  return true;
end;
$$;

revoke all on function public.request_chat_conversation(uuid) from public, anon;
grant execute on function public.request_chat_conversation(uuid) to authenticated;
