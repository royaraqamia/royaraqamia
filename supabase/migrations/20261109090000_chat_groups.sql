-- ============================================================
-- Groups: a name, invites, and the two caps that bound them (#814)
--
-- The schema has carried groups since `20261103090000_chats.sql`: `kind =
-- 'group'` with a required title, an `owner` role, and `invited` as the status
-- an added member holds until they answer. `ChatService.respond()` already
-- answers that invite, and `private.chat_may_add_participant` already admits a
-- group member adding a `requested`/`invited` row. Two things were missing, and
-- both belong in the database rather than in the request handler:
--
-- 1. **How many groups one member owns.** ADR-0113 fixed it at 3 on Free and 20
--    on Pro and left the enforcement to this pull request, where the owned-item
--    counter learns the key. `chat_groups` is a row of `plan_limits`, the shared
--    `private.owned_item_count` learns what one is, and
--    `private.enforce_owned_item_cap('chat_groups', 'created_by')` is the
--    trigger. The Node pre-check only adds the upgrade nudge before any work
--    happens (#526); a direct Data API insert cannot outrun the trigger.
--
-- 2. **How many members one group holds.** The contract caps a create at 31
--    invites plus the creator, and the insert policy lets any active group
--    member add an invite — so the ceiling has to be a row-level guard, not a
--    Zod refinement the Data API never runs.
--
-- Counting a group as "owned" means created by the member and not left:
-- `created_by` never changes, so the count reads the caller's own roster row
-- too. Leaving is what frees the slot (ADR-0113: nothing is hard-deleted).
--
-- Rollback:
--   drop trigger if exists enforce_plan_cap on public.chat_conversations;
--   drop trigger if exists trg_chat_thread_size on public.chat_participants;
--   drop function if exists private.enforce_chat_thread_size();
--   delete from public.plan_limits where key = 'chat_groups';
--   -- then restore `private.owned_item_count` from
--   -- 20261028120000_notes.sql and `private.owned_item_is_active` from
--   -- 20261023140000_enforce_plan_caps_in_postgres.sql (pinned to '' by
--   -- 20261101120000_pin_private_function_search_path.sql).
-- ============================================================

-- ------------------------------------------------------------
-- The owned-item cap: groups a member created and did not leave
-- ------------------------------------------------------------

insert into public.plan_limits (key, label_ar, free_cap, pro_cap, sort_order) values
  ('chat_groups', 'المحادثات الجماعية', 3, 20, 120)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

-- `private.owned_item_count` is one switch over every capped item, so adding an
-- item means replacing the whole function. The body is the 20261028120000 one
-- plus the `chat_groups` case.
create or replace function private.owned_item_count(p_user_id uuid, p_item text)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_count integer;
begin
  case p_item
    when 'habits' then
      select count(*)::integer into v_count
        from public.habits
       where user_id = p_user_id and deleted_at is null;
    when 'expenses' then
      select count(*)::integer into v_count
        from public.expenses
       where user_id = p_user_id and deleted_at is null;
    when 'expense_categories' then
      select count(*)::integer into v_count
        from public.categories
       where user_id = p_user_id and deleted_at is null;
    when 'budgets' then
      select count(*)::integer into v_count
        from public.budgets
       where user_id = p_user_id and deleted_at is null;
    when 'short_links' then
      select count(*)::integer into v_count
        from public.short_links
       where user_id = p_user_id and deleted_at is null;
    when 'community_drafts' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id
         and deleted_at is null
         and status in ('draft', 'scheduled');
    when 'community_published' then
      select count(*)::integer into v_count
        from public.posts
       where author_id = p_user_id and deleted_at is null and status = 'published';
    when 'community_tags' then
      -- No tombstone column: the row is the slot.
      select count(*)::integer into v_count
        from public.community_tags
       where user_id = p_user_id;
    when 'community_categories' then
      select count(*)::integer into v_count
        from public.community_categories
       where user_id = p_user_id;
    when 'quran_bookmarks' then
      select count(*)::integer into v_count
        from public.quran_bookmarks
       where user_id = p_user_id and deleted_at is null;
    when 'notes' then
      select count(*)::integer into v_count
        from public.notes
       where user_id = p_user_id and deleted_at is null;
    when 'chat_groups' then
      -- Created by the member, and their own roster row is not `left`: leaving
      -- is the exit that frees a group slot, because nothing is hard-deleted.
      select count(*)::integer into v_count
        from public.chat_conversations c
       where c.created_by = p_user_id
         and c.kind = 'group'
         and not exists (
           select 1
             from public.chat_participants p
            where p.conversation_id = c.id
              and p.user_id = p_user_id
              and p.status = 'left'
         );
    else
      raise exception 'unknown owned item: %', p_item using errcode = '22023';
  end case;

  return v_count;
end;
$$;

revoke all on function private.owned_item_count(uuid, text) from public, anon, authenticated;

-- The predicate that decides whether a row takes a slot. Every other item is
-- "a live row", but `chat_conversations` holds three kinds in one table: only a
-- group takes a group slot, so a direct thread opened while at the cap is not
-- refused by a counter that does not describe it.
--
-- Pinned to '' as `20261101120000` left it; the body names no object in a
-- schema and uses only JSONB operators.
create or replace function private.owned_item_is_active(p_item text, p_row jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_row is null then false
    when p_item = 'community_published' then
      (p_row ->> 'deleted_at') is null and (p_row ->> 'status') = 'published'
    when p_item = 'community_drafts' then
      (p_row ->> 'deleted_at') is null
      and (p_row ->> 'status') in ('draft', 'scheduled')
    when p_item in ('community_tags', 'community_categories') then true
    when p_item = 'chat_groups' then (p_row ->> 'kind') = 'group'
    else (p_row ->> 'deleted_at') is null
  end
$$;

revoke all on function private.owned_item_is_active(text, jsonb) from public, anon, authenticated;

drop trigger if exists enforce_plan_cap on public.chat_conversations;
create trigger enforce_plan_cap
  before insert or update on public.chat_conversations
  for each row execute function private.enforce_owned_item_cap('chat_groups', 'created_by');

-- ------------------------------------------------------------
-- The member cap: 32 in a group, enforced where the insert happens
-- ------------------------------------------------------------
--
-- `CHAT_GROUP_MEMBERS_MAX` in `shared/contracts/chat.ts` is the same number; a
-- Zod ceiling on the create payload cannot bound a roster that grows by one
-- invite at a time, and the insert policy admits that invite from the Data API
-- too.
--
-- One advisory lock per conversation, so the count and the insert it guards run
-- under the same lock and two invitations racing for the last seat cannot both
-- win — the same shape `private.assert_owned_item_cap` uses per owner and item.
create or replace function private.enforce_chat_thread_size()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_kind  text;
  v_count integer;
begin
  select c.kind into v_kind
    from public.chat_conversations c
   where c.id = new.conversation_id;

  -- A direct thread is the pair and an agent thread is the owner: neither grows.
  if v_kind is distinct from 'group' then
    return new;
  end if;

  -- A closed row (declined, left) holds no seat.
  if new.status not in ('requested', 'invited', 'active') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('chat-group:' || new.conversation_id::text, 0)
  );

  select count(*)::integer into v_count
    from public.chat_participants p
   where p.conversation_id = new.conversation_id
     and p.status in ('requested', 'invited', 'active');

  if v_count + 1 > 32 then
    raise exception 'a group holds at most 32 members'
      using errcode = 'CH001',
            detail = new.conversation_id::text,
            hint = '32';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chat_thread_size() from public, anon, authenticated;

drop trigger if exists trg_chat_thread_size on public.chat_participants;
create trigger trg_chat_thread_size
  before insert on public.chat_participants
  for each row execute function private.enforce_chat_thread_size();
