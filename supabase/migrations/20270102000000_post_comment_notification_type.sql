-- ============================================================
-- A reply on a post is a notification (#1576)
--
-- A comment is written, the count comes back, and nobody is told: the type list
-- on `notifications` has never carried a reply. The column is text with a named
-- CHECK, not an enum, so widening it means replacing that one constraint; the
-- existing members stay exactly as they are and `post_comment` joins them.
--
-- Only the type is database work. The producer lives in PostEngagementService
-- and is fail-safe; delivery, the badge and the destination already exist for
-- the other types. No grant changes: the table still accepts INSERT from the
-- service role only.
--
-- Rollback:
--   alter table public.notifications drop constraint if exists notifications_type_check;
--   alter table public.notifications
--     add constraint notifications_type_check
--       check (type in (
--         'certificate_issued',
--         'habit_reminder',
--         'recovery_nudge',
--         'expense_alert',
--         'link_clicked',
--         'system_announcement',
--         'training_application',
--         'consultation_booking',
--         'project_request',
--         'retainer_request',
--         'subscription_request',
--         'chat_request',
--         'new_follower',
--         'post_published'
--       ));
-- ============================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'certificate_issued',
      'habit_reminder',
      'recovery_nudge',
      'expense_alert',
      'link_clicked',
      'system_announcement',
      'training_application',
      'consultation_booking',
      'project_request',
      'retainer_request',
      'subscription_request',
      'chat_request',
      'new_follower',
      'post_published',
      'post_comment'
    ));
