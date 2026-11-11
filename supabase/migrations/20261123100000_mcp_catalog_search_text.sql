-- ============================================================
-- The store searches the name it draws
--
-- `search_text` was one stored generated column over `title`, `description`,
-- `name_ar`, `description_ar` and `registry_name`. It could not see
-- `title_override`, so a row an admin renamed was findable by its registry key
-- and by nothing else: a brand whose key does not contain its name �?" the row
-- `20261120100000` renames �?" was not searchable at all (#1268).
--
-- Recreating a generated expression is `set expression as`, and that rewrites
-- the table: the first curation migration timed out on exactly that rewrite
-- (#1260, #1262). This table is not the store �?" it holds every row the
-- registry publishes, 40,809 of them on 2026-11-11, where the store draws a
-- couple of hundred �?" so the rewrite is both forbidden and unnecessary.
-- `drop expression` is the metadata-only half: it turns the stored generated
-- column into a base column with the values it already holds, and no row is
-- touched. From then on a trigger owns it.
--
-- Why a trigger rather than an `or()` across `title_override` and `title`:
-- an `or()` is interpolated into PostgREST's filter syntax, which is the hazard
-- `backend/shared/postgrest-or-filter.ts` exists for, and five or-ed columns
-- cannot use one trigram index. One column, one `ilike`, one index, and the
-- store query in `marketplace-repository.ts` does not change.
--
-- Both the drawn name and the registry's own title stay in the text: an admin
-- who names a row "Vercel" should not make `vercel labs` unfindable.
--
-- Rollback (rewrites the table, so only if it can afford one):
--   drop trigger if exists mcp_catalog_search_text on public.mcp_catalog_servers;
--   drop function if exists private.mcp_catalog_search_text();
--   alter table public.mcp_catalog_servers
--     alter column search_text set expression as (lower(
--       coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
--       coalesce(name_ar, '') || ' ' || coalesce(description_ar, '') || ' ' ||
--       registry_name));
-- ============================================================

alter table public.mcp_catalog_servers
  alter column search_text drop expression;

-- The one expression the column is. `search_path` is pinned like every private
-- function in this schema; `lower` and `coalesce` are `pg_catalog`.
create or replace function private.mcp_catalog_search_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(
    coalesce(new.title_override, '') || ' ' ||
    coalesce(new.title, '') || ' ' ||
    coalesce(new.description, '') || ' ' ||
    coalesce(new.name_ar, '') || ' ' ||
    coalesce(new.description_ar, '') || ' ' ||
    new.registry_name
  );
  return new;
end;
$$;

-- A trigger function needs no caller: the privilege that matters is EXECUTE at
-- `create trigger` time, and revoking the rest keeps the private schema private.
revoke all on function private.mcp_catalog_search_text() from public, anon, authenticated;

-- The existing values are still the old expression's, so only the rows whose
-- drawn name the old expression could not see need rewriting: the ones with an
-- override. Eleven rows on 2026-11-11.
update public.mcp_catalog_servers
   set search_text = lower(
     coalesce(title_override, '') || ' ' ||
     coalesce(title, '') || ' ' ||
     coalesce(description, '') || ' ' ||
     coalesce(name_ar, '') || ' ' ||
     coalesce(description_ar, '') || ' ' ||
     registry_name
   )
 where title_override is not null
   and search_text is distinct from lower(
     coalesce(title_override, '') || ' ' ||
     coalesce(title, '') || ' ' ||
     coalesce(description, '') || ' ' ||
     coalesce(name_ar, '') || ' ' ||
     coalesce(description_ar, '') || ' ' ||
     registry_name
   );

-- Every write, not `update of` the six columns: the column is writable through
-- the Data API now, and the trigger is what makes it true whichever patch the
-- sync, the probe or an admin hands PostgREST.
drop trigger if exists mcp_catalog_search_text on public.mcp_catalog_servers;
create trigger mcp_catalog_search_text
  before insert or update on public.mcp_catalog_servers
  for each row execute function private.mcp_catalog_search_text();

-- The partial trigram index from `20261116150000` still covers the same column
-- and keeps answering the store's one `ilike`; nothing to rebuild.
