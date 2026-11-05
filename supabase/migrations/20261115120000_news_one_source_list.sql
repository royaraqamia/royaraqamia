-- ============================================================
-- One list for a reader's own sources (ADR-0130), and a personal digest nobody
-- switches on (ADR-0131).
--
-- The account page used to draw a link twice: once as a proposal with its
-- system/Admin state, and once as a feed with its health. It is one list now —
-- the request while it is on its way, the feed once it is accepted — and the
-- reader can clear either from that list, so the delete needs a policy.
--
-- The personal digest stopped being an opt-in: a reader who holds a source of
-- their own, or who narrowed the catalogue, gets the digest built for them. The
-- column stays (the nightly run and the board read it) but it is true from now
--   on, so no account is left on the shared digest by a switch it can no longer
--   reach.
--
-- Rollback (the data is not lost: only the default and the policy are new):
--   alter table public.news_source_preferences alter column personal_enabled set default false;
--   drop policy if exists "news_source_requests_own_delete" on public.news_source_requests;
--   revoke delete on public.news_source_requests from authenticated;
--   create or replace function private.assert_news_source_cap()  -- as in 20261029160000
-- ============================================================

-- ------------------------------------------------------------
-- The cap reads the write, not the row
-- ------------------------------------------------------------
-- `assert_news_source_cap` (20261029160000) measures `new.source_ids` on every
-- insert and every update, so a row that holds more ids than the plan allows is
-- refused whichever column a write touches. A free reader who selected six
-- sources while the ceiling was 64 is such a row — and the sweep below, and the
-- nightly run's served marker (`last_personal_digest_at`), are both writes to a
-- column that has nothing to do with the selection. Production said so on
-- 2026-11-05: this file stopped at its first statement with
-- `PL001 news.sources`.
--
-- The refusal belongs to the selection. A save carrying more sources than the
-- plan allows is still `PL001`, and a reader already over the cap still cannot
-- add one — but a write that leaves `source_ids` exactly as it was is not a save,
-- which is ADR-0075's "a live row being edited is not a new slot" applied to a
-- selection stored inside one row (amendment 2026-11-05).
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
  -- The selection is unchanged, so this write is not a save of it.
  if tg_op = 'UPDATE' and new.source_ids is not distinct from old.source_ids then
    return new;
  end if;

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

-- ------------------------------------------------------------
-- The digest is on for every account
-- ------------------------------------------------------------
update public.news_source_preferences
   set personal_enabled = true
 where personal_enabled is not true;

alter table public.news_source_preferences
  alter column personal_enabled set default true;

comment on column public.news_source_preferences.personal_enabled is
  'True for every account since ADR-0131: the nightly run builds a digest for a reader who narrowed the catalogue or holds their own sources. The column is kept because the workflow and the board read it.';

-- ------------------------------------------------------------
-- A reader may clear a row that has not become a feed
-- ------------------------------------------------------------
-- The delete is the other half of the one list. An accepted row is the feed's
-- history and the feed is what a reader removes instead, so the policy stops at
-- `user_source_id is null`: a request that produced a source is not deletable
-- from here.
drop policy if exists "news_source_requests_own_delete" on public.news_source_requests;
create policy "news_source_requests_own_delete"
  on public.news_source_requests
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and user_source_id is null
    and status in ('resolving', 'ready', 'needs_review', 'rejected')
  );

grant delete on public.news_source_requests to authenticated;
