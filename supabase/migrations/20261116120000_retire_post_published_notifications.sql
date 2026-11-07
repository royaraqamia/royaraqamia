-- ============================================================
-- Retire the post_published notification type
--
-- Publishing a Community Post used to fan a `post_published` notice out to
-- every Admin. A visual-gate run seeds ten published posts through the real
-- create route, so one run wrote ten notices for posts it deleted seconds
-- later; 313 rows accumulated in three days. Even for a real post the notice
-- is noise once the community publishes regularly, so the producer is gone
-- from `backend/config/blogpress.ts` and the type is removed here too - the
-- check constraint is the only thing that could let a stale writer put one
-- back.
--
-- The delete is bounded (one type, no user-authored data): every row it
-- removes is a notice this change retires.
--
-- Rollback: restore `post_published` to the check list below and the producer
-- in `backend/config/blogpress.ts`.
-- ============================================================

delete from public.notifications where type = 'post_published';

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
      'chat_request'
    ));
