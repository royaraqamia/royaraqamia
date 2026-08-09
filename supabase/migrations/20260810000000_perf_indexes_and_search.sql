-- ============================================================
-- Performance hardening: additive serving indexes only.
-- Verified against the remote project (2026-08-09): the RLS
-- initplan rewrites and FK covering indexes from the previous
-- plan are all ALREADY PRESENT remotely, and the merged policy
-- names (posts_select_own_or_published, blog_categories_select,
-- post_categories_select, ...) already exist. Re-creating them
-- here would fail, so this migration is strictly additive for
-- the actually-missing QUERY-serving indexes.
-- No access semantics change. All DDL is idempotent.
-- ============================================================

-- Full-text-ish trigram search support for ILIKE %..% paths.
create extension if not exists pg_trgm;

-- 1) Analytics hot path: summary + export both filter by link_code
--    and order/range by clicked_at (supabase-analytics.ts). This is
--    the index the entire dashboard + redirect counting read path uses.
create index if not exists idx_analytics_events_link_code_clicked_at
  on public.analytics_events (link_code, clicked_at desc);

-- 2) Notifications list: findByUserId pages user_id ordered by
--    created_at desc with NO is_read filter, so the existing partial
--    idx_notifications_user_unread can never be used. Add a plain
--    (user_id, created_at desc) index for that read path.
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- 3) Habit logs: getLogs/getLast fetch a user's logs by date range.
--    Composite (user_id, date) covers the per-user window scan.
create index if not exists idx_habit_logs_user_date
  on public.habit_logs (user_id, date);

-- 4) Trigram GINs for the ILIKE '%..%' search endpoints:
--    blog posts (title/meta_desc), expenses (description),
--    certificates (student/course/code).
create index if not exists idx_posts_title_meta_trgm
  on public.posts using gin (
    title gin_trgm_ops,
    meta_desc gin_trgm_ops
  );

create index if not exists idx_expenses_description_trgm
  on public.expenses using gin (description gin_trgm_ops);

create index if not exists idx_certificates_search_trgm
  on public.certificates using gin (
    student_name gin_trgm_ops,
    course_name gin_trgm_ops,
    certificate_code gin_trgm_ops
  );