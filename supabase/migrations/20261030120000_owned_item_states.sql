-- ============================================================
-- A member's owned-item caps, each against what the account holds
--
-- `/account/plan` states every allowance the plan enforces. Counted actions
-- already come from `get_usage_counters`; the owned-item caps (habits, notes,
-- links, bookmarks, …) had no read of their own, so the page could not show
-- `3 / 5` for them.
--
-- This adds `public.get_owned_item_states(p_user_id)`, which resolves each
-- `plan_limits` row for the account's effective plan and counts what it holds.
-- The count is `private.owned_item_count` — the same function the create-time
-- trigger calls — so the page and the refusal cannot disagree.
--
-- `mcp_connected_apps` joins that switch: it is a cap like the others, and the
-- count is one per app (a grant may hold an access and a refresh row), which is
-- what the consent route and `countOwned` already do in Node.
--
-- Rollback: drop `public.get_owned_item_states(uuid)` and restore the previous
-- `private.owned_item_count` body from `20261028120000_notes.sql`.
-- ============================================================

-- ------------------------------------------------------------
-- One count per capped item, MCP apps included
-- ------------------------------------------------------------
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
    else
      raise exception 'unknown owned item: %', p_item using errcode = '22023';
  end case;

  return v_count;
end;
$$;

revoke all on function private.owned_item_count(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- The account's owned-item caps
-- ------------------------------------------------------------
create or replace function public.get_owned_item_states(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_plan text;
  v_admin boolean;
  v_items jsonb;
begin
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = p_user_id;
  v_admin := coalesce(v_admin, false);

  v_plan := private.effective_plan(p_user_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', s.key,
        'label', s.label_ar,
        'cap', s.cap,
        'used', s.used,
        'remaining', greatest(s.cap - s.used, 0)
      )
      order by s.sort_order
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      l.key,
      l.label_ar,
      l.sort_order,
      -- An Admin is reported as unlimited by the UI, exactly as the counters
      -- do; the cap it carries is a placeholder the card never prints.
      case when v_admin then 0 when v_plan = 'pro' then l.pro_cap else l.free_cap end as cap,
      private.owned_item_count(p_user_id, l.key) as used
    from public.plan_limits l
  ) s;

  return v_items;
end;
$$;

revoke all on function public.get_owned_item_states(uuid) from public, anon, authenticated;
grant execute on function public.get_owned_item_states(uuid) to service_role;

comment on function public.get_owned_item_states(uuid) is
  'Each owned-item cap for an account, with what it currently holds (ADR-0093).';
