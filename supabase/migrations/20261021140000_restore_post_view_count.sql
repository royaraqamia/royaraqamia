-- Restore the public community view counter (#459).
--
-- `public.increment_post_view_count` still carried the two statements that
-- toggled `update_posts_updated_at` while incrementing:
--
--   alter table public.posts disable trigger update_posts_updated_at;
--   update posts set view_count = view_count + 1 where id = p_post_id;
--   alter table public.posts enable trigger update_posts_updated_at;
--
-- 20261012140354 dropped that trigger on purpose, so the client's logical
-- `updated_at` survives an Outbox replay (ADR-0029, ADR-0033). The function was
-- never updated, so every call raised
--
--   42704: trigger "update_posts_updated_at" for table "posts" does not exist
--
-- and every `POST /api/community/[slug]/view` answered 500 without counting.
--
-- The trigger is not coming back: this file only replaces the function body.
-- DDL-free, and no `view_count` value is backfilled or recalculated.
-- `scripts/__tests__/post-view-count-migration.test.ts` owns the regression
-- guard, since the repository test mocks this RPC.

create or replace function public.increment_post_view_count(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from posts
    where id = p_post_id
      and (status = 'published' or (status = 'scheduled' and publish_at <= now()))
  ) then
    return;
  end if;

  update posts set view_count = view_count + 1 where id = p_post_id;
end;
$function$;

revoke all on function public.increment_post_view_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_post_view_count(uuid) to service_role;
