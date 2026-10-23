-- ============================================================
-- The owned-item caps and the post publication rules, enforced in
-- Postgres (#526)
--
-- ADR-0075 says the plan is enforceable on the server, and until this file
-- that was only true of the Next.js request layer: `PlanGate` and
-- `backend/services/plans/usage-service.ts` count a table and the controller
-- inserts afterwards, in a different transaction. The browser is handed the
-- project URL and the publishable key, and `authenticated` still holds the
-- table-level INSERT/UPDATE/DELETE grants on every owned table with own-row
-- RLS, so the Data API could write straight past both the caps and the
-- publication rules. Two concurrent requests could outrun the count-then-insert
-- even through the app.
--
-- This file moves the enforcement to the row:
--
--   * every capped owned item gets a BEFORE INSERT OR UPDATE trigger that
--     counts the owner's live rows under an advisory lock keyed on
--     (user_id, item), reads the effective plan from `private.plan_window` and
--     the caps from `plan_limits`, and refuses a row that would pass the cap.
--     The lock is transaction-scoped, so two concurrent inserts for the last
--     slot serialise and the second one counts the first.
--   * `posts` gets a column guard: the client role may not set or change
--     `status`, `published_at`, `community_visible`, `view_count` or `featured`.
--   * the publication transitions (publish, save-and-publish, unpublish,
--     schedule, feature, bulk publish, restore) move out of the client and into
--     SECURITY DEFINER functions that resolve the author from `auth.uid()`, so
--     HTTP, MCP and the offline replay all take the same gated path.
--
-- Grandfathering is deliberate: the trigger only checks a NEW row or a tombstone
-- revival, never a live row being edited, so an account that was over its cap
-- when the plan lapsed keeps its data and simply cannot add more. Deletes keep
-- freeing a slot because the count excludes tombstones.
--
-- A refusal raises SQLSTATE `PL001`, a code of our own rather than a generic
-- check violation: the monthly recurring materialiser has to let one capped
-- account's row go rather than abort the run for every account, and it catches
-- exactly that. A real constraint failure still raises.
--
-- The Node pre-checks stay as a fast refusal with the upgrade nudge; they are no
-- longer the enforcement point.
--
-- Rollback:
--   -- and `public.materialize_due_recurring_expenses` goes back to its
--   -- 20260807123000 body.
--   drop trigger if exists guard_post_server_columns on public.posts;
--   drop trigger if exists enforce_plan_cap_published on public.posts;
--   drop trigger if exists enforce_plan_cap_drafts on public.posts;
--   drop trigger if exists enforce_plan_cap on public.quran_bookmarks;
--   drop trigger if exists enforce_plan_cap on public.community_categories;
--   drop trigger if exists enforce_plan_cap on public.community_tags;
--   drop trigger if exists enforce_plan_cap on public.short_links;
--   drop trigger if exists enforce_plan_cap on public.budgets;
--   drop trigger if exists enforce_plan_cap on public.categories;
--   drop trigger if exists enforce_plan_cap on public.expenses;
--   drop trigger if exists enforce_plan_cap on public.habits;
--   drop function if exists public.restore_post(jsonb);
--   drop function if exists public.bulk_publish_posts(uuid[], boolean);
--   drop function if exists public.set_post_featured(uuid, boolean);
--   drop function if exists public.schedule_post(uuid, timestamptz);
--   drop function if exists public.unpublish_post(uuid);
--   drop function if exists public.publish_post(uuid, jsonb);
--   drop function if exists private.guard_post_server_columns();
--   drop function if exists private.enforce_owned_item_cap();
--   drop function if exists private.assert_owned_item_cap(uuid, text, integer);
--   drop function if exists private.owned_item_is_active(text, jsonb);
--   drop function if exists private.owned_item_count(uuid, text);
-- ============================================================

-- ------------------------------------------------------------
-- Counting: one item key per capped table
-- ------------------------------------------------------------

-- The database half of `SupabaseUsageRepository.countOwned`, deliberately kept
-- in the same shape: the item keys are the contract `plan_limits` is keyed on,
-- the owner column is the one the cap is counted per, and a tombstone frees the
-- slot exactly where the Node count excludes it.
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
    else
      raise exception 'unknown owned item: %', p_item using errcode = '22023';
  end case;

  return v_count;
end;
$$;

revoke all on function private.owned_item_count(uuid, text) from public, anon, authenticated;

-- Whether this row holds a slot for its item. A row is expressed as JSONB so the
-- cap triggers can stay generic: one trigger function per table class instead of
-- one per (table, item) pair.
create or replace function private.owned_item_is_active(p_item text, p_row jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_row is null then false
    when p_item = 'community_published' then
      (p_row ->> 'deleted_at') is null and (p_row ->> 'status') = 'published'
    when p_item = 'community_drafts' then
      (p_row ->> 'deleted_at') is null
      and (p_row ->> 'status') in ('draft', 'scheduled')
    when p_item in ('community_tags', 'community_categories') then true
    else (p_row ->> 'deleted_at') is null
  end
$$;

revoke all on function private.owned_item_is_active(text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- The check itself
-- ------------------------------------------------------------

-- Refuse a write that would take `p_user_id` past the cap for `p_item`.
--
-- Called from the trigger below, and explicitly from the publication RPCs: a
-- status transition inside one row (draft -> published) is not what the trigger
-- checks, so the RPC that performs it is the place that has to ask.
--
-- `p_incoming` is how many slots the write takes, so a bulk publish is one
-- check rather than a per-row count.
create or replace function private.assert_owned_item_cap(
  p_user_id uuid,
  p_item text,
  p_incoming integer default 1
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_plan text;
  v_cap integer;
  v_count integer;
  v_admin boolean;
begin
  if p_user_id is null then
    return;
  end if;

  -- Admin allowance is reported as unlimited everywhere else, so it is exempt
  -- here too. `users.is_admin` is the synced mirror of the ADMIN_EMAILS
  -- allowlist (`sync_admin_flag`), which is what `spend_credits` reads.
  select exists (
    select 1 from public.users u where u.id = p_user_id and u.is_admin
  ) into v_admin;

  if v_admin then
    return;
  end if;

  -- One lock per (owner, item). The count below therefore runs against a state
  -- no concurrent insert for the same owner and item can move, and the lock is
  -- held until the transaction commits.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_item, 0));

  select w.plan into v_plan from private.plan_window(p_user_id) w;

  select case when v_plan = 'pro' then l.pro_cap else l.free_cap end
    into v_cap
    from public.plan_limits l
   where l.key = p_item;

  -- An item the catalog does not cap has nothing to enforce.
  if v_cap is null then
    return;
  end if;

  v_count := private.owned_item_count(p_user_id, p_item);

  if v_count + greatest(coalesce(p_incoming, 1), 0) > v_cap then
    -- A dedicated SQLSTATE, not a generic check violation: a caller that must
    -- survive a refusal (the monthly recurring materialiser) catches exactly
    -- this, and a real constraint failure still raises.
    raise exception 'the plan cap for % is reached', p_item
      using errcode = 'PL001',
            detail = p_item,
            hint = v_cap::text;
  end if;
end;
$$;

revoke all on function private.assert_owned_item_cap(uuid, text, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- Triggers: one per capped table, item and owner column as arguments
-- ------------------------------------------------------------

create or replace function private.enforce_owned_item_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_item text := tg_argv[0];
  v_owner_column text := tg_argv[1];
  v_owner uuid;
  v_row jsonb := to_jsonb(new);
begin
  if not private.owned_item_is_active(v_item, v_row) then
    return new;
  end if;

  -- A row that was already live holds its slot: editing it is not a create, and
  -- an account that was over the cap when the plan lapsed keeps what it has.
  -- Only a new row (INSERT) or a tombstone revival takes a new slot.
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> 'deleted_at') is null then
    return new;
  end if;

  v_owner := (v_row ->> v_owner_column)::uuid;
  perform private.assert_owned_item_cap(v_owner, v_item);

  return new;
end;
$$;

revoke all on function private.enforce_owned_item_cap() from public, anon, authenticated;

drop trigger if exists enforce_plan_cap on public.habits;
create trigger enforce_plan_cap
  before insert or update on public.habits
  for each row execute function private.enforce_owned_item_cap('habits', 'user_id');

drop trigger if exists enforce_plan_cap on public.expenses;
create trigger enforce_plan_cap
  before insert or update on public.expenses
  for each row execute function private.enforce_owned_item_cap('expenses', 'user_id');

-- `categories` is the table behind the `expense_categories` key. Default rows
-- carry `user_id is null`, so they never count and never check.
drop trigger if exists enforce_plan_cap on public.categories;
create trigger enforce_plan_cap
  before insert or update on public.categories
  for each row execute function private.enforce_owned_item_cap('expense_categories', 'user_id');

drop trigger if exists enforce_plan_cap on public.budgets;
create trigger enforce_plan_cap
  before insert or update on public.budgets
  for each row execute function private.enforce_owned_item_cap('budgets', 'user_id');

drop trigger if exists enforce_plan_cap on public.short_links;
create trigger enforce_plan_cap
  before insert or update on public.short_links
  for each row execute function private.enforce_owned_item_cap('short_links', 'user_id');

drop trigger if exists enforce_plan_cap on public.community_tags;
create trigger enforce_plan_cap
  before insert or update on public.community_tags
  for each row execute function private.enforce_owned_item_cap('community_tags', 'user_id');

drop trigger if exists enforce_plan_cap on public.community_categories;
create trigger enforce_plan_cap
  before insert or update on public.community_categories
  for each row execute function private.enforce_owned_item_cap('community_categories', 'user_id');

drop trigger if exists enforce_plan_cap on public.quran_bookmarks;
create trigger enforce_plan_cap
  before insert or update on public.quran_bookmarks
  for each row execute function private.enforce_owned_item_cap('quran_bookmarks', 'user_id');

-- `posts` carries two caps: the drafts bucket and the published bucket. A row
-- only ever sits in one, so at most one of these checks anything.
drop trigger if exists enforce_plan_cap_drafts on public.posts;
create trigger enforce_plan_cap_drafts
  before insert or update on public.posts
  for each row execute function private.enforce_owned_item_cap('community_drafts', 'author_id');

drop trigger if exists enforce_plan_cap_published on public.posts;
create trigger enforce_plan_cap_published
  before insert or update on public.posts
  for each row execute function private.enforce_owned_item_cap('community_published', 'author_id');

-- ------------------------------------------------------------
-- The post columns the client no longer owns
-- ------------------------------------------------------------

-- Restricted by the executing role, not by a flag a caller could set: the guard
-- applies to the two client roles the publishable key can reach (`anon` included,
-- so a policy loosened later cannot reopen the column hole). A SECURITY DEFINER
-- function runs as its owner (`postgres`) and the service-role client connects as
-- `service_role`, so both pass untouched.
--
-- Deliberately SECURITY INVOKER (the default) — a definer guard would see
-- `postgres` as `current_user` and never fire.
create or replace function private.guard_post_server_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A client may only create a draft. Publishing is a transition, and the
    -- transitions live in the RPCs below.
    if new.status <> 'draft'
       or new.published_at is not null
       or coalesce(new.community_visible, false)
       or coalesce(new.view_count, 0) <> 0
       or coalesce(new.featured, false)
    then
      raise exception 'post status and publication columns are server-owned'
        using errcode = '42501',
              detail = 'status, published_at, community_visible, view_count, featured';
    end if;

    return new;
  end if;

  if new.status is distinct from old.status
     or new.published_at is distinct from old.published_at
     or new.community_visible is distinct from old.community_visible
     or new.view_count is distinct from old.view_count
     or new.featured is distinct from old.featured
  then
    raise exception 'post status and publication columns are server-owned'
      using errcode = '42501',
            detail = 'status, published_at, community_visible, view_count, featured';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_post_server_columns() from public, anon, authenticated;

drop trigger if exists guard_post_server_columns on public.posts;
create trigger guard_post_server_columns
  before insert or update on public.posts
  for each row execute function private.guard_post_server_columns();

-- ------------------------------------------------------------
-- Publication transitions
--
-- Every one resolves the author from `auth.uid()` and scopes by it, so the same
-- call is safe for HTTP, for the MCP bridge session and for an offline replay:
-- none of them can move another account's post, and none of them needs the
-- service-role key. The cap is checked inside the same transaction as the write
-- that takes the slot.
-- ------------------------------------------------------------

-- Publish a draft, optionally saving the editor's fields at the same time
-- (`saveAndPublishPost`). `p_fields` only carries the columns the editor owns;
-- an absent key keeps the stored value and an explicit null clears it.
create or replace function public.publish_post(p_post_id uuid, p_fields jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_status public.post_status;
  v_slug text;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.status into v_status
    from public.posts p
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  -- Publishing a draft takes a published slot; re-saving or re-publishing an
  -- already published post does not.
  if v_status <> 'published' then
    perform private.assert_owned_item_cap(v_author, 'community_published');
  end if;

  update public.posts p
     set status = 'published',
         published_at = now(),
         community_visible = true,
         updated_at = now(),
         slug = coalesce(p_fields ->> 'slug', p.slug),
         content = case
           when p_fields ? 'content' then p_fields ->> 'content' else p.content
         end,
         cover_image = case
           when p_fields ? 'cover_image' then p_fields ->> 'cover_image' else p.cover_image
         end,
         meta_title = case
           when p_fields ? 'meta_title' then p_fields ->> 'meta_title' else p.meta_title
         end,
         meta_desc = case
           when p_fields ? 'meta_desc' then p_fields ->> 'meta_desc' else p.meta_desc
         end,
         reading_time_minutes = case
           when p_fields ? 'reading_time_minutes'
             then (p_fields ->> 'reading_time_minutes')::integer
             else p.reading_time_minutes
         end
   where p.id = p_post_id
     and p.author_id = v_author
   returning p.slug into v_slug;

  return v_slug;
end;
$$;

create or replace function public.unpublish_post(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_slug text;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.posts p
     set status = 'draft',
         published_at = null,
         updated_at = now()
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null
   returning p.slug into v_slug;

  if v_slug is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  return v_slug;
end;
$$;

create or replace function public.schedule_post(p_post_id uuid, p_publish_at timestamptz)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_status public.post_status;
  v_slug text;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_publish_at is null then
    raise exception 'a publish time is required' using errcode = '22023';
  end if;

  select p.status into v_status
    from public.posts p
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  -- Scheduling a draft stays in the drafts bucket; scheduling a published post
  -- moves it, so that is the case that takes a new slot.
  if v_status not in ('draft', 'scheduled') then
    perform private.assert_owned_item_cap(v_author, 'community_drafts');
  end if;

  update public.posts p
     set status = 'scheduled',
         publish_at = p_publish_at,
         updated_at = now()
   where p.id = p_post_id
     and p.author_id = v_author
   returning p.slug into v_slug;

  return v_slug;
end;
$$;

create or replace function public.set_post_featured(p_post_id uuid, p_featured boolean)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_slug text;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_featured is null then
    raise exception 'a featured flag is required' using errcode = '22023';
  end if;

  update public.posts p
     set featured = p_featured,
         updated_at = now()
   where p.id = p_post_id
     and p.author_id = v_author
     and p.deleted_at is null
   returning p.slug into v_slug;

  if v_slug is null then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  return v_slug;
end;
$$;

-- The bulk publish/unpublish the admin list and the MCP tools share. One cap
-- check for the whole batch: only the rows that are not already published take
-- a slot, which is what the caller's own count in Node cannot know.
create or replace function public.bulk_publish_posts(p_post_ids uuid[], p_publish boolean)
returns setof text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_new integer;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_publish then
    select count(*)::integer into v_new
      from public.posts p
     where p.id = any(p_post_ids)
       and p.author_id = v_author
       and p.deleted_at is null
       and p.status <> 'published';

    if v_new > 0 then
      perform private.assert_owned_item_cap(v_author, 'community_published', v_new);
    end if;
  end if;

  return query
    with updated as (
      update public.posts p
         set status = case
               when p_publish then 'published'::public.post_status
               else 'draft'::public.post_status
             end,
             published_at = case when p_publish then now() else null end,
             community_visible = case when p_publish then true else p.community_visible end,
             updated_at = now()
       where p.id = any(p_post_ids)
         and p.author_id = v_author
       returning p.slug
    )
    select updated.slug from updated;
end;
$$;

-- Undo a delete by re-inserting the row the Local Store kept (ADR-0060). The
-- snapshot is client-held, so the columns it must not decide are decided here:
-- a restored post starts at zero views, is not featured unless the caller is an
-- Admin, and is only community-visible for an Admin. `published_at` and
-- `publish_at` are the snapshot's, because a restored published post is
-- expected to come back at its original date.
create or replace function public.restore_post(p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_slug text := nullif(trim(p_snapshot ->> 'slug'), '');
  v_id uuid;
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if v_slug is null then
    raise exception 'a slug is required' using errcode = '22023';
  end if;

  insert into public.posts (
    author_id, slug, content, status, cover_image, meta_title, meta_desc,
    published_at, publish_at, view_count, featured, community_visible,
    reading_time_minutes, updated_at
  ) values (
    v_author,
    v_slug,
    p_snapshot ->> 'content',
    case p_snapshot ->> 'status'
      when 'published' then 'published'::public.post_status
      when 'scheduled' then 'scheduled'::public.post_status
      else 'draft'::public.post_status
    end,
    p_snapshot ->> 'cover_image',
    p_snapshot ->> 'meta_title',
    p_snapshot ->> 'meta_desc',
    nullif(p_snapshot ->> 'published_at', '')::timestamptz,
    nullif(p_snapshot ->> 'publish_at', '')::timestamptz,
    0,
    false,
    coalesce((p_snapshot ->> 'community_visible')::boolean, false) and private.is_admin(),
    coalesce(nullif(p_snapshot ->> 'reading_time_minutes', '')::integer, 0),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Reachable by a signed-in caller only; the service role keeps execute for the
-- server-side module, and `anon` gets nothing.
revoke all on function public.publish_post(uuid, jsonb) from public, anon;
revoke all on function public.unpublish_post(uuid) from public, anon;
revoke all on function public.schedule_post(uuid, timestamptz) from public, anon;
revoke all on function public.set_post_featured(uuid, boolean) from public, anon;
revoke all on function public.bulk_publish_posts(uuid[], boolean) from public, anon;
revoke all on function public.restore_post(jsonb) from public, anon;

grant execute on function public.publish_post(uuid, jsonb) to authenticated, service_role;
grant execute on function public.unpublish_post(uuid) to authenticated, service_role;
grant execute on function public.schedule_post(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.set_post_featured(uuid, boolean) to authenticated, service_role;
grant execute on function public.bulk_publish_posts(uuid[], boolean) to authenticated, service_role;
grant execute on function public.restore_post(jsonb) to authenticated, service_role;

-- ------------------------------------------------------------
-- One server-side writer has to survive a refusal
-- ------------------------------------------------------------

-- The monthly recurring materialiser creates an expense without going through a
-- create path, so before #526 it could take an account past the standing expense
-- cap. With the trigger in place its INSERT raises, and because the loop is one
-- transaction that refusal would abort the run for every other account too.
-- Skipping the row instead is what the app already does at the cap: the account
-- keeps its data and the next create is refused.
--
-- Body unchanged from 20260807123000 apart from the guarded insert.
create or replace function public.materialize_due_recurring_expenses()
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  rec record;
  first_day date := date_trunc('month', current_date)::date;
  last_day  int  := extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
  target    date;
  target_txt text;
begin
  for rec in
    select * from public.recurring_expenses
    where active = true
      and start_month <= to_char(current_date, 'YYYY-MM')
  loop
    target      := first_day + (least(rec.day_of_month, last_day) - 1);
    target_txt  := to_char(target, 'YYYY-MM-DD');
    if not exists (
      select 1 from public.expenses e
      where e.user_id = rec.user_id
        and e.category_id = rec.category_id
        and e.amount = rec.amount
        and e.date::text = target_txt
    ) then
      begin
        insert into public.expenses (user_id, amount, category_id, date, description)
        values (rec.user_id, rec.amount, rec.category_id, target_txt, rec.description);
      exception
        when sqlstate 'PL001' then
          null;
      end;
    end if;
  end loop;
  return true;
end;
$fn$;

revoke execute on function public.materialize_due_recurring_expenses() from public, anon;
revoke execute on function public.materialize_due_recurring_expenses() from authenticated;
