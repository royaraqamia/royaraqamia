-- Publish the owned tables for Realtime sync hints (ADR-0060).
--
-- A hint is a `postgres_changes` signal that there is something new to pull, and
-- Realtime only streams changes for tables in the `supabase_realtime`
-- publication. RLS decides what each subscriber receives (hints subscribe with a
-- `user_id=eq.…` filter on top of it); this migration only puts the tables on the
-- wire.
--
-- Only the tables whose surfaces have a client pull are published. BlogPress's
-- `posts` and the lead tables (`project_requests`, `training_applications`,
-- `retainers`) are deliberately absent: their pages read on the server through
-- their loader and have no client pull to trigger, so a hint would have nothing
-- to do. See docs/specs/offline-first.md.
--
-- Why publishing is safe here, checked against the linked project before this
-- file was written (these tables predate supabase/migrations, so their policies
-- are not in this repository):
--
--   habits, habit_logs, expenses, budgets, recurring_expenses
--     an anonymous read returns zero rows.
--   categories
--     an anonymous read returns the ten default rows, all with `user_id is null`
--     — the shared defaults the product seeds from — and none of the rows that
--     belong to an account.
--   short_links
--     anonymous SELECT is revoked outright and the read policy is owner-scoped
--     (`20261015103957_narrow_short_links_public_read.sql`).
--
-- That check is why the loop refuses to publish a table whose RLS is off rather
-- than trusting a per-environment setting: without RLS, Realtime streams every
-- tenant's rows to every subscriber, and a client-side `filter` is a convenience,
-- never a boundary. A table that is simply absent (a branch or scratch project
-- built from these migrations) is skipped instead, so the file is safe to re-run
-- anywhere. Whether a table is already a member varies by environment, which is
-- why the add itself is guarded too.
--
-- `replica identity` is left at its default on purpose. App deletes are
-- tombstones — an UPDATE, which carries the new row and so reaches an RLS
-- subscriber — while `replica identity full` would be exactly the WAL cost the
-- hint does not need. The one hard delete in the codebase is the bulk clear
-- inside `restoreFromBackup`, and the restore's inserts that follow announce the
-- change instead.
do $$
declare
  target text;
  target_has_rls boolean;
begin
  foreach target in array array[
    'habits',
    'habit_logs',
    'expenses',
    'categories',
    'budgets',
    'recurring_expenses',
    'short_links'
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
