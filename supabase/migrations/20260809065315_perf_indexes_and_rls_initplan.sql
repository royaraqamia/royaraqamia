-- ============================================================
-- Performance hardening: RLS initplan rewrites + FK covering indexes.
-- Reconstructed from the live remote schema (2026-08-09) so the local
-- migration set matches `supabase_migrations.schema_migrations` 1:1.
-- All DDL is idempotent; safe to replay on a fresh database.
-- ============================================================

-- 1) MERGED SELECT POLICIES (initplan rewrites)
-- Replace the separate owner + public-read SELECT policies on the blog
-- read path with a single merged policy so the per-row `auth.uid()`
-- subquery is evaluated once (initplan) instead of repeatedly.

drop policy if exists "Users can view their own blog categories" on public.blog_categories;
drop policy if exists "Public can view categories of published posts" on public.blog_categories;
create policy "blog_categories_select"
  on public.blog_categories
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from post_categories pc
      join posts p on p.id = pc.post_id
      where pc.category_id = p.id
        and p.status = 'published'
        and p.blog_visible = true
    )
  );

drop policy if exists "Authors can view categories of their posts" on public.post_categories;
drop policy if exists "Public can view categories of published posts" on public.post_categories;
create policy "post_categories_select"
  on public.post_categories
  for select
  to public
  using (
    exists (
      select 1
      from posts p
      where p.id = post_id
        and (
          p.author_id = (select auth.uid())
          or (p.status = 'published' and p.blog_visible = true)
        )
    )
  );

drop policy if exists "Users can view their own blog tags" on public.blog_tags;
drop policy if exists "Public can view tags of published posts" on public.blog_tags;
create policy "blog_tags_select"
  on public.blog_tags
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1
      from post_tags pt
      join posts p on p.id = pt.post_id
      where pt.tag_id = p.id
        and p.status = 'published'
        and p.blog_visible = true
    )
  );

drop policy if exists "Authors can view tags of their posts" on public.post_tags;
drop policy if exists "Public can view tags of published posts" on public.post_tags;
create policy "post_tags_select"
  on public.post_tags
  for select
  to public
  using (
    exists (
      select 1
      from posts p
      where p.id = post_id
        and (
          p.author_id = (select auth.uid())
          or (p.status = 'published' and p.blog_visible = true)
        )
    )
  );

drop policy if exists posts_select on public.posts;
drop policy if exists posts_select_own_or_published on public.posts;
create policy "posts_select_own_or_published"
  on public.posts
  for select
  to public
  using (
    (select auth.uid()) = author_id
    or status = 'published'
  );

-- 2) FK COVERING INDEXES
-- Cover the FK lookups on the hot read paths so Postgres never seq-scans
-- the child table when resolving a parent id.

create index if not exists idx_posts_author_id
  on public.posts (author_id);

create index if not exists idx_short_links_user_id
  on public.short_links (user_id);

create index if not exists idx_categories_user_id
  on public.categories (user_id);

create index if not exists idx_expenses_category_id
  on public.expenses (category_id);

create index if not exists idx_expenses_user_date
  on public.expenses (user_id, date desc);

create index if not exists idx_recurring_expenses_category_id
  on public.recurring_expenses (category_id);

create index if not exists idx_budgets_category_id
  on public.budgets (category_id);

create index if not exists idx_habits_user_id
  on public.habits (user_id);

create index if not exists idx_habit_logs_user_id
  on public.habit_logs (user_id);

create index if not exists idx_habit_logs_date
  on public.habit_logs (date);

create index if not exists idx_certificates_code
  on public.certificates (certificate_code);

create index if not exists idx_analytics_events_link_code
  on public.analytics_events (link_code);

create index if not exists idx_analytics_events_clicked_at
  on public.analytics_events (clicked_at);