-- ============================================================
-- BlogPress: categories, scheduled publishing, and view counts
-- ============================================================

-- 1) extend post_status enum with 'scheduled'
alter type public.post_status add value if not exists 'scheduled' after 'published';

-- 2) posts: scheduled publishing + view counts
alter table public.posts add column if not exists publish_at timestamptz;
alter table public.posts add column if not exists view_count integer not null default 0;

create index if not exists idx_posts_publish_at on public.posts (publish_at);

-- 3) blog categories (scoped to the author who created them)
create table if not exists public.blog_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- 4) many-to-many between posts and blog categories
create table if not exists public.post_categories (
  post_id     uuid not null references public.posts(id) on delete cascade,
  category_id uuid not null references public.blog_categories(id) on delete cascade,
  primary key (post_id, category_id)
);

create index if not exists idx_post_categories_category_id
  on public.post_categories (category_id);

-- 5) RLS
alter table public.blog_categories enable row level security;
alter table public.post_categories enable row level security;

create policy "Users can view their own blog categories"
  on public.blog_categories for select to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can create their own blog categories"
  on public.blog_categories for insert to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own blog categories"
  on public.blog_categories for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "Users can delete their own blog categories"
  on public.blog_categories for delete to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Public can view categories of published posts"
  on public.blog_categories for select to public
  using ( exists (
    select 1
    from public.post_categories pc
    join public.posts p on p.id = pc.post_id
    where pc.category_id = id
      and p.status = 'published'
      and p.blog_visible = true
  ) );

create policy "Authors can view categories of their posts"
  on public.post_categories for select to authenticated
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Authors can attach categories to their posts"
  on public.post_categories for insert to authenticated
  with check ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Authors can detach categories from their posts"
  on public.post_categories for delete to authenticated
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id and p.author_id = (select auth.uid())
  ) );

create policy "Public can view categories of published posts"
  on public.post_categories for select to public
  using ( exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.status = 'published'
      and p.blog_visible = true
  ) );

grant select, insert, update, delete on public.blog_categories to authenticated;
grant select, insert, delete on public.post_categories to authenticated;

-- 6) public view counter (anon can call it, avoids bumping updated_at)
create or replace function public.increment_post_view_count(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not exists (
    select 1 from posts
    where id = p_post_id
      and (status = 'published' or (status = 'scheduled' and publish_at <= now()))
  ) then
    return;
  end if;

  alter table public.posts disable trigger update_posts_updated_at;
  update posts set view_count = view_count + 1 where id = p_post_id;
  alter table public.posts enable trigger update_posts_updated_at;
end;
$function$;

grant execute on function public.increment_post_view_count(uuid) to anon, authenticated;
