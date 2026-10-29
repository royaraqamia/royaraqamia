-- ============================================================
-- Publish public.notes for Realtime sync hints (ADR-0060, ADR-0092)
--
-- Notes rows are single-owner, so the only cross-device question is latency:
-- how soon one device learns that another wrote. The answer is the same
-- `postgres_changes` signal every other owned product uses, and Realtime only
-- streams changes for tables in the `supabase_realtime` publication.
--
-- A second file rather than a line in the 20261019120000 array, because that
-- migration is already applied and an applied migration never runs again
-- (docs/supabase.md). The guard is the same: RLS must be on, and it is —
-- 20261028120000_notes.sql gives the table owner-scoped policies only, so an
-- anonymous read returns nothing and a subscriber receives its own rows and
-- nobody else's.
--
-- `replica identity` stays at its default: a delete is a tombstone (an UPDATE,
-- which carries the new row and reaches an RLS subscriber), so `full` would be
-- WAL cost the hint does not need.
--
-- Rollback:
--   alter publication supabase_realtime drop table public.notes;
-- ============================================================

do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array[
    'notes'
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
