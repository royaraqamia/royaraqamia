-- ============================================================
-- Publish the Quran Reader's two owned tables for Realtime hints (ADR-0060)
--
-- The reader's place and its marks are single-owner rows, so the only
-- cross-device question is *latency*: how soon one device learns that another
-- wrote. The answer is a `postgres_changes` signal that triggers the pull the
-- surface already runs on open, focus and reconnect (ADR-0060), and Realtime only
-- streams changes for tables in the `supabase_realtime` publication.
--
-- This is a second file rather than a line in
-- `20261019120000_publish_owned_tables_for_realtime_hints.sql`, which is already
-- applied: an applied migration never runs again, so a table added to its array
-- would never reach the project (docs/supabase.md, "Never edit an applied
-- migration"). The two files share their shape and their guard below, and
-- `scripts/__tests__/realtime-hint-tables.test.ts` reads every one of them.
--
-- Why publishing is safe here, checked against the linked project before this
-- file was written: `20261019150000_quran_sync_tables.sql` enables row level
-- security on both tables and gives each one owner-scoped policies only
-- (`(select auth.uid()) = user_id`, for select, insert, update and delete), so an
-- anonymous read returns nothing and a subscriber receives its own rows and
-- nobody else's. The loop refuses a table whose RLS is off rather than trusting
-- that: without RLS, Realtime streams every tenant's rows to every subscriber,
-- and a client-side `filter` is a convenience, never a boundary. A table that is
-- simply absent (a branch or scratch project built from these migrations) is
-- skipped instead, so the file is safe to re-run anywhere.
--
-- `replica identity` is left at its default on purpose. The reader's removals are
-- tombstones — an UPDATE, which carries the new row and so reaches an RLS
-- subscriber — and `replica identity full` would be exactly the WAL cost the hint
-- does not need. The store's own `clear()` writes nothing to the server: it is
-- what a Claim leaves behind in the guest database it took the records from.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.quran_bookmarks;
--   alter publication supabase_realtime drop table public.quran_reading_positions;
-- ============================================================

do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array[
    'quran_reading_positions',
    'quran_bookmarks'
  ]
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
