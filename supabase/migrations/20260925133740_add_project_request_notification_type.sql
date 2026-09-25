-- Adds the 'project_request' notification type.
--
-- Every submission from /request-project notifies admins (in-app + Web Push), so
-- the type must be permitted by notifications_type_check. Without this the
-- insert throws a check-constraint violation at runtime, after the project
-- request row is already written.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'certificate_issued',
      'post_published',
      'habit_reminder',
      'recovery_nudge',
      'expense_alert',
      'link_clicked',
      'system_announcement',
      'training_application',
      'consultation_booking',
      'project_request'
    ));
