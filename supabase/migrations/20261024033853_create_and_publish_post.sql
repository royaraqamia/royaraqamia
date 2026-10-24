-- ============================================================
-- Create and publish a new community post in one write (#527)
--
-- The Community composer used to create a body-less draft and then publish it
-- in a second request. A free account already holding its draft allowance was
-- refused by the first call even though the post was never meant to stay a
-- draft, and a refused publish left the orphan draft behind.
--
-- `upsert_post` cannot carry the publication columns: it runs as the caller
-- (`SECURITY INVOKER`) and `private.guard_post_server_columns` refuses a client
-- insert that sets `status`, `published_at` or `community_visible`. This
-- function is the server-owned create half of `publish_post`, in the same shape
-- as the other publication transitions: it resolves the author from
-- `auth.uid()`, so neither the browser's publishable key nor an MCP bridge
-- session can publish for another account.
--
-- Publication columns are set here and are never read from the client. The
-- `enforce_plan_cap_published` trigger runs on the insert and refuses a row
-- that would take the account past its published cap, under the same advisory
-- lock as every other capped write, so the slot is checked in the same
-- transaction that takes it.
--
-- The draft path stays on `upsert_post`: a real draft and the offline replay
-- still create or update a draft.
--
-- Rollback: drop function if exists public.create_and_publish_post(
--   text, text, text, text, text, integer);
-- ============================================================

create or replace function public.create_and_publish_post(
  p_slug text,
  p_content text,
  p_cover_image text,
  p_meta_title text,
  p_meta_desc text,
  p_reading_time_minutes integer
)
returns table (id uuid, slug text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_author uuid := auth.uid();
  v_id uuid := gen_random_uuid();
begin
  if v_author is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  insert into public.posts (
    id,
    author_id,
    client_id,
    slug,
    content,
    cover_image,
    meta_title,
    meta_desc,
    reading_time_minutes,
    status,
    published_at,
    community_visible,
    updated_at
  ) values (
    v_id,
    v_author,
    v_id,
    p_slug,
    p_content,
    p_cover_image,
    p_meta_title,
    p_meta_desc,
    coalesce(p_reading_time_minutes, 0),
    'published',
    now(),
    true,
    now()
  );

  return query select v_id, p_slug;
end;
$$;

revoke all on function public.create_and_publish_post(text, text, text, text, text, integer)
  from public, anon;
grant execute on function public.create_and_publish_post(text, text, text, text, text, integer)
  to authenticated, service_role;
