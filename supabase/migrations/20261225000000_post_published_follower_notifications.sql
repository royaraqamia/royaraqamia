-- ============================================================
-- Restore post_published as a follower-scoped notification
--
-- The 2026-11-16 retirement removed the whole notification hop because the old
-- producer fanned a `post_published` notice out to every Admin. A visual-gate
-- run seeds ten posts through the real create route, so one run wrote ten
-- notices for posts it deleted seconds later (313 rows in three days). The
-- audience was the role, not the relationship.
--
-- This migration restores only the type. The audience now comes from the
-- follow graph: one row per `follows.follower_id` of the author, and none for
-- an Admin who does not follow. The visual gate's own accounts are excluded
-- by the producer from `harnessEmails()` (the same fixture list
-- `scripts/chat-quality-signals.mjs` uses), so a seeded post writes nothing.
-- No role is consulted here: the graph and the harness list are enough.
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
      'post_published'
    ));
