-- ============================================================
-- Rename the "blog" naming to "community"
--
-- The public blog surface is now the Community. This renames the
-- remaining database-level "blog" identifiers that back it:
--   tables   blog_categories -> community_categories
--            blog_tags       -> community_tags
--   column   posts.blog_visible -> posts.community_visible
--   policies blog_categories_select / blog_tags_select
--   indexes  idx_blog_tags_user_id, idx_posts_published_feed
--
-- The `posts` noun and the `post_categories` / `post_tags` join
-- tables are intentionally kept: "post" is the domain noun, only the
-- "blog" qualifier is retired. The BlogPress product keeps its name.
--
-- Table renames carry their owned indexes, constraints and policies
-- with a matching new name, so only names that do NOT track the table
-- (or that embed a column) are renamed explicitly.
--
-- Also fixes two pre-existing policy bugs where the category/tag FK
-- was compared to the post id instead of the category/tag id.
--
-- Idempotent: every step is guarded with IF EXISTS / IF NOT EXISTS so a
-- re-run is a no-op.
-- ============================================================

-- 1. Tables ---------------------------------------------------------
alter table if exists public.blog_categories rename to community_categories;
alter table if exists public.blog_tags rename to community_tags;

-- 2. Column ---------------------------------------------------------
-- Guarded: on a database where the rename has already run (so the
-- column is already community_visible), this is a no-op. Postgres has
-- no "RENAME COLUMN IF EXISTS", so probe the catalog first.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'blog_visible'
  ) then
    alter table public.posts rename column blog_visible to community_visible;
  end if;
end $$;

-- 3. Indexes that do not track the table name, or embed the column ---
alter index if exists public.idx_blog_tags_user_id rename to idx_community_tags_user_id;

drop index if exists public.idx_posts_published_feed;
create index if not exists idx_posts_published_feed
  on public.posts (published_at desc)
  where status = 'published' and community_visible;

-- 4. Policies -------------------------------------------------------
-- The two table-owned "select" policies are renamed explicitly and
-- re-pointed at community_visible, correcting the FK comparison.
drop policy if exists blog_categories_select on public.community_categories;
drop policy if exists community_categories_select on public.community_categories;
create policy "community_categories_select"
  on public.community_categories for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.post_categories pc
      join public.posts p on p.id = pc.post_id
      where pc.category_id = community_categories.id
        and p.status = 'published'
        and p.community_visible = true
    )
  );

drop policy if exists blog_tags_select on public.community_tags;
drop policy if exists community_tags_select on public.community_tags;
create policy "community_tags_select"
  on public.community_tags for select to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from public.post_tags pt
      join public.posts p on p.id = pt.post_id
      where pt.tag_id = community_tags.id
        and p.status = 'published'
        and p.community_visible = true
    )
  );

-- Join-table select policies keep their names but must reference the
-- renamed column.
drop policy if exists post_categories_select on public.post_categories;
create policy "post_categories_select"
  on public.post_categories for select to public
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_categories.post_id
        and (
          p.author_id = (select auth.uid())
          or (p.status = 'published' and p.community_visible = true)
        )
    )
  );

drop policy if exists post_tags_select on public.post_tags;
create policy "post_tags_select"
  on public.post_tags for select to public
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_tags.post_id
        and (
          p.author_id = (select auth.uid())
          or (p.status = 'published' and p.community_visible = true)
        )
    )
  );

-- 5. Table-owned index names ----------------------------------------
-- Postgres keeps the original name when a table is renamed, so the
-- primary-key and unique indexes and the three per-table user policies
-- are renamed explicitly.
alter index if exists public.blog_categories_pkey
  rename to community_categories_pkey;
alter index if exists public.blog_categories_user_id_slug_key
  rename to community_categories_user_id_slug_key;
alter index if exists public.blog_tags_pkey
  rename to community_tags_pkey;
alter index if exists public.blog_tags_user_id_slug_key
  rename to community_tags_user_id_slug_key;

-- 6. Table-owned policy names ---------------------------------------
drop policy if exists "Users can create their own blog categories" on public.community_categories;
drop policy if exists "Users can update their own blog categories" on public.community_categories;
drop policy if exists "Users can delete their own blog categories" on public.community_categories;
drop policy if exists "Users can create their own blog tags" on public.community_tags;
drop policy if exists "Users can update their own blog tags" on public.community_tags;
drop policy if exists "Users can delete their own blog tags" on public.community_tags;
drop policy if exists "Users can create their own community categories" on public.community_categories;
drop policy if exists "Users can update their own community categories" on public.community_categories;
drop policy if exists "Users can delete their own community categories" on public.community_categories;
drop policy if exists "Users can create their own community tags" on public.community_tags;
drop policy if exists "Users can update their own community tags" on public.community_tags;
drop policy if exists "Users can delete their own community tags" on public.community_tags;

create policy "Users can create their own community categories"
  on public.community_categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own community categories"
  on public.community_categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own community categories"
  on public.community_categories for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own community tags"
  on public.community_tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own community tags"
  on public.community_tags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own community tags"
  on public.community_tags for delete to authenticated
  using ((select auth.uid()) = user_id);
