-- ============================================================
-- Chat attachment sweep: a cursor that survives the night (#1701)
--
-- The sweep used to walk the bucket depth-first with `storage.list`, reading at
-- most 2,000 objects and setting a `truncated` flag that nobody consumed. Two
-- bounds were silent: the object cap had no cursor, and the top-level folder
-- listing stopped at its own first page of 1,000. Both left a remainder the
-- next run started over from the head of.
--
-- This migration gives the sweep a position instead of a ceiling:
--
--   * one state row names the last object visited (`last_path`); a full drain
--     clears it back to the bucket's head and stamps `swept_at`;
--   * `chat_attachment_sweep_page` is a keyset read over `storage.objects`
--     ordered by name, so a page has no folder list to fill and no offset to
--     go stale — `name > p_after` is the position, not an index into a list;
--   * `chat_attachment_sweep_stats` puts the bucket's own count and bytes next
--     to the row-summed bytes the quota sees, so a divergence is observable.
--
-- `storage` is not an exposed PostgREST schema, and an orphan has no row for
-- RLS to answer to anyway, so both reads are security definer and granted to
-- `service_role` alone (ADR-0113). The sweep deletes through Storage's own
-- remove API; only reads live here.
--
-- Rollback:
--   revoke execute on function public.chat_attachment_sweep_stats() from service_role;
--   revoke execute on function public.chat_attachment_sweep_page(text, integer) from service_role;
--   drop function if exists public.chat_attachment_sweep_stats();
--   drop function if exists public.chat_attachment_sweep_page(text, integer);
--   revoke all on public.chat_attachment_sweep_state from service_role;
--   drop table if exists public.chat_attachment_sweep_state;
-- ============================================================

-- ------------------------------------------------------------
-- The position, one row per bucket
-- ------------------------------------------------------------

create table if not exists public.chat_attachment_sweep_state (
  bucket text primary key,
  -- Empty means "from the head"; a full drain clears it to this value.
  last_path text not null default '',
  swept_at timestamptz
);

alter table public.chat_attachment_sweep_state enable row level security;

revoke all on public.chat_attachment_sweep_state from public, anon, authenticated;
grant select, insert, update on public.chat_attachment_sweep_state to service_role;

-- ------------------------------------------------------------
-- One keyset page, no folders
-- ------------------------------------------------------------

create or replace function public.chat_attachment_sweep_page(
  p_after text,
  p_limit integer
)
returns table (
  name text,
  updated_at timestamptz,
  size_bytes bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select o.name,
         o.updated_at,
         coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and o.name > p_after
   order by o.name
   limit least(greatest(p_limit, 1), 1000);
$$;

revoke all on function public.chat_attachment_sweep_page(text, integer)
  from public, anon, authenticated;
grant execute on function public.chat_attachment_sweep_page(text, integer) to service_role;

-- ------------------------------------------------------------
-- What the quota cannot see
-- ------------------------------------------------------------

create or replace function public.chat_attachment_sweep_stats()
returns table (
  bucket_objects bigint,
  bucket_bytes bigint,
  row_objects bigint,
  row_bytes bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select (select count(*) from storage.objects o
           where o.bucket_id = 'chat-attachments'),
         (select coalesce(sum((o.metadata->>'size')::bigint), 0)
            from storage.objects o
           where o.bucket_id = 'chat-attachments'),
         (select count(*) from public.chat_attachments),
         (select coalesce(sum(a.byte_size), 0) from public.chat_attachments a);
$$;

revoke all on function public.chat_attachment_sweep_stats()
  from public, anon, authenticated;
grant execute on function public.chat_attachment_sweep_stats() to service_role;
