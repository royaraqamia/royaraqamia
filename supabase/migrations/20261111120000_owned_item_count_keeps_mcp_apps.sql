-- ============================================================
-- The owned-item read keeps every capped item
--
-- `/account/plan` fails for every account because `private.owned_item_count`
-- stopped handling `mcp_connected_apps`. `20261109090000_chat_groups.sql`
-- replaced the whole switch (one `case` over every capped item) with a body
-- copied from `20261028120000_notes.sql`, which predates the MCP case that
-- `20261030120000_owned_item_states.sql` added. `get_owned_item_states` loops
-- over `plan_limits`, `mcp_connected_apps` is one of its rows, and the missing
-- branch raises `22023` — so the whole read answers 400 and `GET /api/me/plan`
-- answers 500 for members, admins, Free and Pro alike, on the site and in the
-- app (both read the one route, ADR-0098).
--
-- The body below is the `20261109090000` one plus that case, unchanged
-- otherwise. `plan_limits` is the list of items, so a rewrite of this function
-- that forgets one is a read failure, not a wrong number:
-- `supabase/tests/plan_reads_test.sql` fails when a `plan_limits` key has no
-- branch here.
--
-- Rollback: restore the `20261109090000_chat_groups.sql` body.
-- ============================================================

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
    when 'mcp_connected_apps' then
      -- One grant may hold an access and a refresh row for the same app, so the
      -- cap counts the app, not the token.
      select count(distinct t.client_id)::integer into v_count
        from public.mcp_oauth_tokens t
       where t.user_id = p_user_id
         and t.revoked_at is null
         and t.expires_at > now();
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
