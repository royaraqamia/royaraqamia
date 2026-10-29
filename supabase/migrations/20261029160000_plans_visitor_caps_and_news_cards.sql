-- ============================================================
-- Visitor caps, news cards and the news-source ceiling
--
-- The amendment to ADR-0093: every product a visitor can already use gets
-- exactly one item (device-enforced, delete frees the slot), Free keeps 5 and
-- Pro 50, and the news page is limited by how many story cards it shows rather
-- than by how many digests a reader opens.
--
--   * `plan_limits.visitor_cap` — 1 where a visitor can hold the item, 0 where
--     the product needs an account. A visitor owns no server rows, so the
--     number binds on the device only (HabitFlow, SpendTrack, Notes, Quran
--     bookmarks); LinkSnap's anonymous row is capped by its own trigger below.
--   * `plan_quotas` — per-plan numbers that are neither a row an account owns
--     nor an action it takes: news cards shown, news sources selected.
--   * `news.digest.open` leaves `usage_limits`. Opening a digest is no longer
--     counted at all; the card cap replaces it.
--   * `news_source_preferences` loses its hard 64-id ceiling, which the plan
--     cap (5 / 50) replaces. It is enforced by a trigger because the row is
--     written through the Data API, where a UI-only check is bypassable.
--   * `short_links` gains the visitor subject so one live anonymous link per
--     visitor can be enforced where the row is written.
--
-- Rollback:
--   drop trigger if exists assert_anonymous_link_cap on public.short_links;
--   drop trigger if exists assert_news_source_cap on public.news_source_preferences;
--   drop function if exists private.assert_anonymous_link_cap();
--   drop function if exists private.assert_news_source_cap();
--   drop function if exists public.news_card_cap(uuid);
--   alter table public.short_links drop column if exists visitor_key, drop column if exists ip_hash;
--   alter table public.news_source_preferences
--     add constraint news_source_preferences_source_ids_len check (cardinality(source_ids) <= 64);
--   drop table if exists public.plan_quotas;
--   alter table public.plan_limits drop column if exists visitor_cap;
-- ============================================================

-- ------------------------------------------------------------
-- What a visitor may hold
-- ------------------------------------------------------------
alter table public.plan_limits
  add column if not exists visitor_cap integer not null default 0
    check (visitor_cap >= 0);

update public.plan_limits
   set visitor_cap = 1,
       updated_at = now()
 where key in (
   'habits',
   'expenses',
   'expense_categories',
   'budgets',
   'notes',
   'quran_bookmarks',
   'short_links'
 );

update public.plan_limits
   set visitor_cap = 0,
       updated_at = now()
 where key in (
   'community_drafts',
   'community_published',
   'community_tags',
   'community_categories',
   'mcp_connected_apps'
 );

comment on column public.plan_limits.visitor_cap is
  'What a visitor may hold: 1 where the product works without an account (device-enforced, delete frees the slot), 0 where it needs one (ADR-0093).';

-- ------------------------------------------------------------
-- Per-plan numbers that are neither a row nor an action
-- ------------------------------------------------------------
create table if not exists public.plan_quotas (
  key text primary key,
  label_ar text not null,
  visitor_cap integer not null check (visitor_cap >= 0),
  free_cap integer not null check (free_cap >= 0),
  pro_cap integer not null check (pro_cap >= 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.plan_quotas
  (key, label_ar, visitor_cap, free_cap, pro_cap, sort_order) values
  ('news.story.cards', 'بطاقات أخبار في الصفحة',  1, 5, 50, 10),
  ('news.sources',     'مصادر أخبار مختارة',      0, 5, 50, 20)
on conflict (key) do update
  set label_ar = excluded.label_ar,
      visitor_cap = excluded.visitor_cap,
      free_cap = excluded.free_cap,
      pro_cap = excluded.pro_cap,
      sort_order = excluded.sort_order,
      updated_at = now();

alter table public.plan_quotas enable row level security;

revoke all on public.plan_quotas from anon, authenticated;
grant select on public.plan_quotas to anon, authenticated;

drop policy if exists "plan_quotas_public_read" on public.plan_quotas;
create policy "plan_quotas_public_read" on public.plan_quotas
  for select to anon, authenticated using (true);

comment on table public.plan_quotas is
  'Per-plan numbers that are neither an owned row nor a counted action: news cards shown, news sources selected (ADR-0093).';

-- ------------------------------------------------------------
-- Opening a digest is no longer counted
-- ------------------------------------------------------------
delete from public.usage_events where action_key = 'news.digest.open';
delete from public.usage_limits where key = 'news.digest.open';

-- ------------------------------------------------------------
-- How many news cards this reader's plan may show
-- ------------------------------------------------------------
-- Resolved here rather than in Node so the page and any future writer agree on
-- one number. A visitor has no account and is answered by the caller with the
-- `visitor_cap` (one card), so this function is for a signed-in reader only.
create or replace function public.news_card_cap(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_admin boolean;
  v_plan text;
  v_cap integer;
begin
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = p_user_id;

  if coalesce(v_admin, false) then
    select pro_cap into v_cap from public.plan_quotas where key = 'news.story.cards';
    return coalesce(v_cap, 50);
  end if;

  v_plan := private.effective_plan(p_user_id);

  select case when v_plan = 'pro' then pro_cap else free_cap end into v_cap
    from public.plan_quotas
   where key = 'news.story.cards';

  return coalesce(v_cap, 5);
end;
$$;

revoke all on function public.news_card_cap(uuid) from public;
revoke all on function public.news_card_cap(uuid) from anon;
revoke all on function public.news_card_cap(uuid) from authenticated;
grant execute on function public.news_card_cap(uuid) to service_role;

-- ------------------------------------------------------------
-- The news-source ceiling is the plan, not 64
-- ------------------------------------------------------------
alter table public.news_source_preferences
  drop constraint if exists news_source_preferences_source_ids_len;

-- No grandfathering allowance: a save above the plan's cap is refused, so a
-- reader already over it must cut down before they can change anything. That is
-- deliberate — a stored selection of 20 keeps filtering, it just cannot be
-- written again.
create or replace function private.assert_news_source_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin boolean;
  v_plan text;
  v_cap integer;
  v_selected integer;
begin
  select coalesce(u.is_admin, false) into v_admin
    from public.users u where u.id = new.user_id;

  if coalesce(v_admin, false) then
    return new;
  end if;

  v_selected := cardinality(coalesce(new.source_ids, '{}'));
  v_plan := private.effective_plan(new.user_id);

  select case when v_plan = 'pro' then pro_cap else free_cap end into v_cap
    from public.plan_quotas
   where key = 'news.sources';

  if v_cap is not null and v_selected > v_cap then
    raise exception 'the plan source cap is reached'
      using errcode = 'PL001',
            detail = 'news.sources',
            hint = v_cap::text;
  end if;

  return new;
end;
$$;

revoke all on function private.assert_news_source_cap() from public;
revoke all on function private.assert_news_source_cap() from anon;
revoke all on function private.assert_news_source_cap() from authenticated;

drop trigger if exists assert_news_source_cap on public.news_source_preferences;
create trigger assert_news_source_cap
  before insert or update on public.news_source_preferences
  for each row execute function private.assert_news_source_cap();

-- ------------------------------------------------------------
-- One live anonymous link per visitor
-- ------------------------------------------------------------
alter table public.short_links
  add column if not exists visitor_key text,
  add column if not exists ip_hash text;

create index if not exists idx_short_links_visitor_live
  on public.short_links (visitor_key)
  where visitor_key is not null and deleted_at is null;

create index if not exists idx_short_links_ip_live
  on public.short_links (ip_hash)
  where ip_hash is not null and deleted_at is null;

comment on column public.short_links.visitor_key is
  'The first-party visitor cookie that created an anonymous link. Paired with ip_hash, so one visitor owns one live anonymous link (ADR-0093).';
comment on column public.short_links.ip_hash is
  'Salted hash of the creating address for an anonymous link. Never the address itself.';

-- A visitor cannot delete an anonymous link today (deletion needs a session), so
-- the slot is used for the life of the link; the trigger is what stops a second
-- one from being written by the same subject. A legacy anonymous row carries no
-- subject and is left alone rather than refused.
create or replace function private.assert_anonymous_link_cap()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_live integer;
begin
  if new.user_id is not null then
    return new;
  end if;

  if new.visitor_key is null and new.ip_hash is null then
    return new;
  end if;

  select count(*)::integer into v_live
    from public.short_links l
   where l.user_id is null
     and l.deleted_at is null
     and (
       (new.visitor_key is not null and l.visitor_key = new.visitor_key)
       or (new.ip_hash is not null and l.ip_hash = new.ip_hash)
     );

  if v_live >= 1 then
    raise exception 'the visitor link cap is reached'
      using errcode = 'PL001',
            detail = 'short_links',
            hint = '1';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_anonymous_link_cap() from public;
revoke all on function private.assert_anonymous_link_cap() from anon;
revoke all on function private.assert_anonymous_link_cap() from authenticated;

drop trigger if exists assert_anonymous_link_cap on public.short_links;
create trigger assert_anonymous_link_cap
  before insert on public.short_links
  for each row execute function private.assert_anonymous_link_cap();
