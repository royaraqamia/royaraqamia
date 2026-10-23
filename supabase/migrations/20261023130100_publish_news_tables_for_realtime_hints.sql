-- ============================================================
-- Publish the news digest tables for Realtime (ADR-0060)
--
-- The /news page is public and its content changes once a day, from a workflow
-- the browser has no other signal from. The page subscribes to INSERTs on
-- `news_digests` and refreshes the server component, so a reader with the page
-- open is offered the new digest without waiting for a manual reload.
--
-- Realtime only streams changes for tables in the `supabase_realtime`
-- publication, so this file adds `news_digests` — the INSERT the page cares
-- about. `news_stories` is deliberately not published: the page's subscription
-- answers "a digest changed" by re-reading the whole day, and a re-run replaces
-- the day's digest row too (scripts/news/publish-digest.mjs), so the digest event
-- already covers its stories. Publishing a second table would be a stream nobody
-- subscribes to.
--
-- Why this is safe: both tables have RLS on and a `select` policy of `true` to
-- anon and authenticated (20261023130000), so the payload a subscriber receives
-- is exactly the payload an anonymous GET already returns: the digest is public
-- by design. Nothing user-scoped lives in either table.
--
-- The loop refuses a table whose RLS is off rather than trusting that, and skips
-- a table that is simply absent (a branch built from these migrations before the
-- create file), so the file is safe to re-run anywhere.
--
-- `replica identity` stays at its default: nothing deletes rows in normal
-- operation except the 30-day sweep, and that deletion needs no payload.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.news_digests;
-- ============================================================

do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array['news_digests']
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
        'Refusing to publish public.% to Realtime: row level security is off, so every subscriber would receive every row',
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
