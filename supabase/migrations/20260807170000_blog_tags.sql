-- ============================================================
-- BlogPress: tags (many-to-many) mirroring blog_categories
-- ============================================================

-- 1) blog tags (scoped to the author who created them)
create table if not exists public.blog_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists idx_blog_tags_user_id on public.blog_tags (user_id);

-- 2) many-to-many between posts and blog tags
create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id  uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create index if not exists idx_post_tags_tag_id on public.post_tags (tag_id);

-- 3) RLS
alter table public.blog_tags enable row level security;
alter table public.post_tags enable row level security;

create policy "Users can view their own blog tags"
  on public.blog_tags for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can create their own blog tags"
  on public.blog_tags for insert to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own blog tags"
  on public.blog_tags for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete their own blog tags"
  on public.blog_tags for delete to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Public can view tags of published posts"
  on public.blog_tags for select to public
  using ( exists (
    select 1
    from public.post_tags pt
    join public.posts p on p.id = pt.post_id
    where pt.tag_id = id
      and p.status = 'published'
      and p.blog_visible = true
  ) );

create policy "Authors can view tags of their posts"
  on public.post_tags for select to authenticated
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Authors can attach tags to their posts"
  on public.post_tags for insert to authenticated
  with check ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Authors can detach tags from their posts"
  on public.post_tags for delete to authenticated
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Public can view tags of published posts"
  on public.post_tags for select to public
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.status = 'published'
      and p.blog_visible = true
  ) );

grant select, insert, update, delete on public.blog_tags to authenticated;
grant select, insert, delete on public.post_tags to authenticated;