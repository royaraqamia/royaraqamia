-- Assertions for the catalogue's search text (#1268).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- `search_text` is a base column a trigger maintains, not a generated one:
-- recreating the generation expression rewrites the table, which the first
-- curation migration timed out on (#1260, #1262). What is asserted here is the
-- trigger, and that the column is no longer generated at all.

begin;

create extension if not exists pgtap;

select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
--
-- Two ordinary catalogue rows: one the registry names, and one an admin renames
-- below. The registry key of the second deliberately does not contain the name
-- it is drawn under, which is the row this issue exists for.

insert into public.mcp_catalog_servers (registry_name, title, description, remote_url)
values
  ('com.example/notion', 'Notion', 'A workspace for notes', 'https://mcp.notion.example/mcp'),
  ('com.example/acme', 'Acme Labs', 'Build pipelines', 'https://mcp.acme.example/mcp');

-- ---------------------------------------------------------------------------
-- Before the override
-- ---------------------------------------------------------------------------

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/notion')
    like '%notion%',
  'a new row carries its registry title in the text'
);

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    like '%acme labs%'
  and
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    not like '%vercel%',
  'without an override the text is the registry title, and the drawn name is absent'
);

-- ---------------------------------------------------------------------------
-- The drawn name
-- ---------------------------------------------------------------------------

update public.mcp_catalog_servers
   set title_override = 'Vercel'
 where registry_name = 'com.example/acme';

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    like '%vercel%',
  'the name the store draws is searchable once an admin supplies it'
);

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    like '%acme labs%',
  'the registry title stays searchable beside the override'
);

-- ---------------------------------------------------------------------------
-- Every column the text is drawn from moves it
-- ---------------------------------------------------------------------------

update public.mcp_catalog_servers
   set description = 'Deployments and previews'
 where registry_name = 'com.example/acme';

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    like '%deployments and previews%',
  'a new description is in the text'
);

update public.mcp_catalog_servers
   set name_ar = 'فيرسل'
 where registry_name = 'com.example/acme';

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    like '%فيرسل%',
  'the Arabic name is in the text'
);

-- A base column is writable; the trigger is what makes it true whichever patch
-- arrives through PostgREST.
update public.mcp_catalog_servers
   set search_text = 'tampered'
 where registry_name = 'com.example/acme';

select ok(
  (select search_text from public.mcp_catalog_servers where registry_name = 'com.example/acme')
    not like '%tampered%',
  'a direct write to the column is overwritten by the trigger'
);

-- ---------------------------------------------------------------------------
-- The shape the migration promised
-- ---------------------------------------------------------------------------

select ok(
  (
    select attgenerated::text = ''
      from pg_attribute
     where attrelid = 'public.mcp_catalog_servers'::regclass
       and attname = 'search_text'
  ),
  'search_text is a base column, not a stored generated column'
);

select ok(
  exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
     where c.relname = 'idx_mcp_catalog_servers_search'
       and i.indisvalid
  ),
  'the store''s trigram index survived the conversion'
);

select * from finish();

rollback;
