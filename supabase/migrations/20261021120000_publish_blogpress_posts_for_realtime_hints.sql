-- ============================================================
-- Publish BlogPress's `posts` for Realtime hints (ADR-0060, #384)
--
-- A draft's tombstones and edits made on another device are answered by the
-- `postgres_changes` signal that triggers the pull the editor surface already
-- runs on open, focus and reconnect (`pullBlogpressData`, ADR-0060). Realtime
-- only streams changes for tables in the `supabase_realtime` publication.
--
-- This is a third file rather than a line in
-- `20261019120000_publish_owned_tables_for_realtime_hints.sql`, which is already
-- applied: an applied migration never runs again, and that file's header lists
-- BlogPress as deliberately absent — true when it was written, because the store
-- had `mergeServerData` and no caller (#384). The client pull now exists (the
-- GET on /api/blogpress/sync and its registry bounds), so the table has a
-- subscriber to deliver to.
--
-- Why publishing is safe here, checked against the repository's migrations
-- rather than an inline probe: RLS is on for `posts`, and its select policy
-- (`posts_select_own_or_published` in 20260809065315) is
-- `auth.uid() = author_id or status = 'published'` — a subscriber can receive
-- only its author's rows or *published* posts, whose payload is public data
-- anyway (the community feed serves them to anonymous visitors). Drafts and
-- scheduled posts are owner-scoped, and the surface's subscription filter
-- (`author_id=eq.<uid>`) keeps even those public events off the wire. The
-- difference from the earlier publication files is that "an anonymous read
-- returns zero rows" does NOT hold here — what holds is "an anonymous read
-- returns only rows the feed would hand out publicly", which bounds the hint to
-- the same blast radius the RLS read policy already has.
--
-- The loop refuses a table whose RLS is off rather than trusting that: without
-- RLS, Realtime streams every tenant's rows to every subscriber. A table that is
-- simply absent (a branch or scratch project built from these migrations) is
-- skipped instead, so the file is safe to re-run anywhere.
--
-- `replica identity` is left at its default on purpose. BlogPress deletes are
-- tombstones — an UPDATE, which carries the new row and reaches an RLS
-- subscriber — and `replica identity full` would be exactly the WAL cost the
-- hint does not need.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.posts;
-- ============================================================

do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array['posts']
  loop
    select c.relrowsecurity
      into target_has_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = target;

    if target_has_rls is null then
      raise notice 'public.% is not in this database; skipping it', target;
      continue;
    end if;

    if not target_has_rls then
      raise exception
        'Refusing to publish public.% to Realtime: row level security is off, so every subscriber would receive every tenant row',
        target;
    end if;

    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target);
    end if;
  end loop;
end $$;
