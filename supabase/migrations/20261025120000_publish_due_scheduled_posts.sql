-- ============================================================
-- A scheduled Community Post becomes public when its time comes (#570)
--
-- `schedule_post` moved a Post to `status = 'scheduled'` and stored `publish_at`,
-- and then nothing ever moved it on: there was no pg_cron job, and no writer took
-- the schedule -> published transition. The public read layer was already written
-- for due rows — `PUBLISHED_POSTS_FILTER`, `app/sitemap.ts` and
-- `increment_post_view_count` all admit `status = 'scheduled' and publish_at <=
-- now()` — but the `posts` RLS policy only exposes `status = 'published' and
-- community_visible`, and the community loaders read through the anon client, so
-- the filter could never return anything. A scheduled post was reachable from the
-- author's dashboard only, and the sitemap and `docs/vercel-usage.md` described a
-- path that could not happen.
--
-- The promotion lives in Postgres rather than in one caller so that every writer
-- takes it: HTTP, the MCP bridge session and the Data API all end at the same
-- function, and none of them needs the service-role key.
--
-- Scheduling deliberately spends nothing (a scheduled row occupies a draft slot
-- until now, which is what the schedule path already checks). Promotion is the
-- publish: it takes the `community_published` slot and spends the
-- `community.post.publish` credit, in the same transaction as the write that
-- makes the row readable. A refusal leaves the row scheduled — never published
-- for free — and the run carries on with the other due rows.
--
-- Rollback:
--   select cron.unschedule('publish-due-scheduled-posts');
--   drop function if exists public.publish_due_scheduled_posts();
-- ============================================================

create extension if not exists pg_cron;

create or replace function public.publish_due_scheduled_posts()
returns integer
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_due record;
  v_spend jsonb;
  v_event_id uuid;
  v_promoted integer := 0;
begin
  -- `skip locked` keeps two overlapping runs from waiting on the same row; the
  -- guarded UPDATE below is the second line of defence, because a row could still
  -- stop being scheduled between the read and the write.
  for v_due in
    select p.id, p.author_id, p.publish_at
      from public.posts p
     where p.status = 'scheduled'
       and p.publish_at is not null
       and p.publish_at <= now()
       and p.deleted_at is null
     order by p.publish_at
       for update skip locked
  loop
    -- The `enforce_plan_cap_published` trigger does not fire here: it returns
    -- early for an UPDATE of a live row, and this is a status transition on a
    -- live row. Asking explicitly is what stops promotion from being a way
    -- around the published cap.
    begin
      perform private.assert_owned_item_cap(v_due.author_id, 'community_published');
    exception
      when sqlstate 'PL001' then
        continue;
    end;

    v_spend := public.spend_credits(v_due.author_id, 'community.post.publish');

    if not coalesce((v_spend ->> 'allowed')::boolean, false) then
      continue;
    end if;

    -- An Admin is never charged, so the spend comes back without an event to
    -- refund; everyone else gets one, and only that id can give the credit back.
    v_event_id := nullif(v_spend ->> 'eventId', '')::uuid;

    update public.posts p
       set status = 'published',
           published_at = coalesce(p.publish_at, now()),
           community_visible = true,
           updated_at = now()
     where p.id = v_due.id
       and p.status = 'scheduled'
       and p.deleted_at is null;

    if found then
      v_promoted := v_promoted + 1;
    elsif v_event_id is not null then
      -- The row moved on under us, so the credit buys nothing: refund it rather
      -- than leave a charge against a publish that did not happen.
      perform public.refund_credits(v_due.author_id, v_event_id);
    end if;
  end loop;

  return v_promoted;
end;
$fn$;

revoke execute on function public.publish_due_scheduled_posts()
  from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'publish-due-scheduled-posts') then
    perform cron.schedule(
      'publish-due-scheduled-posts',
      '*/5 * * * *',
      $$select public.publish_due_scheduled_posts()$$
    );
  end if;
end;
$do$;
