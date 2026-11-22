-- ============================================================
-- Least-privilege grants for the two Data API roles
--
-- Before 2026-10-30 Supabase's default ACL in `public` granted anon and
-- authenticated INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/
-- MAINTAIN on every new table. The platform stopped applying that default for
-- new objects (docs/supabase.md, "New public objects need explicit grants"),
-- but existing tables still carry the ACL and stale pg_default_acl rows are
-- still present. RLS refuses the probes those roles can make through
-- PostgREST, with two gaps worth closing at the capability layer:
--
--   * TRUNCATE is not subject to RLS, and the public roles hold it today;
--   * pg_net's HTTP client is a capability no Data API caller needs.
--
-- This migration does not touch SELECT/INSERT/UPDATE/DELETE: those are the
-- working grants RLS constrains, and the per-table and per-column grants that
-- already exist (certificate projection, posts, user-owned tables, RPC-only
-- tables) are the capability model. What is removed is the incidental
-- privilege that no caller uses, plus the stale default so a new object cannot
-- inherit it again.
--
-- `alter extension pg_net set schema extensions` is deliberately NOT issued:
-- pg_net is not relocatable (extrelocatable = false) and its functions live in
-- the non-exposed `net` schema already. The EXECUTE revoke below is the part
-- that closes the exposure; 20260917082727 covered three signatures, this one
-- covers every function the extension currently installs.
--
-- Rollback: re-run the grants from the default ACL for each role if a caller
-- genuinely needs one; the SELECT/INSERT/UPDATE/DELETE grants are untouched.
-- ============================================================

-- 1. Stop the stale default ACL from re-granting the two public roles on any
--    object created in `public`. service_role's entry is left alone: it
--    bypasses RLS, not privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- The platform seeds a second default-ACL row for its own owner. A migration
-- is not necessarily a member of that role; try, and record the outcome
-- instead of failing the apply when the row is platform-managed.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    begin
      execute 'alter default privileges for role supabase_admin in schema public ' ||
              'revoke all on tables from anon, authenticated';
    exception
      when insufficient_privilege then
        raise notice 'public default ACL owned by supabase_admin is platform-managed; left unchanged';
    end;
  end if;
end
$$;

-- 2. Drop the privileges no Data API caller uses on the tables that already
--    exist. A per-relation loop keeps this to real tables (including
--    partitioned and foreign tables) rather than trying to revoke TRUNCATE
--    from a view. MAINTAIN is a PostgreSQL 17 privilege, so guard it by server
--    version for a from-scratch replay on an older engine.
do $$
declare
  rel record;
begin
  for rel in
    select format('%I.%I', n.nspname, c.relname) as qualified
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'f')
      -- Only the objects whose ACL the migration runner may change. A
      -- platform-owned table in `public` is left to its owner; the guard makes
      -- the migration replayable on a hosted project as well as the local one.
      and pg_has_role(current_user, c.relowner, 'USAGE')
  loop
    execute format(
      'revoke truncate, references, trigger on %s from anon, authenticated',
      rel.qualified
    );

    if current_setting('server_version_num')::integer >= 170000 then
      execute format(
        'revoke maintain on %s from anon, authenticated',
        rel.qualified
      );
    end if;
  end loop;
end
$$;

-- 3. pg_net stays where it is; its capability does not. Revoke the implicit
--    PUBLIC grant on every function in the `net` schema, including overloads
--    added by future extension upgrades. The SECURITY DEFINER callers
--    (dispatch_github_workflow, the habit reminders and nudges, wake_agent_turns)
--    run as their owner, so their path through net.http_post is unaffected;
--    the explicit grant keeps that true if the extension is owner-installed.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to postgres', fn);
  end loop;
end
$$;
