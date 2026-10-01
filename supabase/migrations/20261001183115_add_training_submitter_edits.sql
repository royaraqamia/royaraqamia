-- Submitter edits for training_applications.
--
-- A signed-in visitor now has an account-based path to edit their own
-- application after submitting it (`/account/submissions`). The visitor fields
-- are replaceable, **except** `cohort_id` while the application is enrolled: an
-- enrolled seat is a scarce reservation claimed through the
-- `enroll_application` RPC, so changing the cohort must go through
-- release-then-enroll, never a plain update (ADR-0008). `status`, `notes`,
-- `reference_code` and `user_id` stay server/Admin-owned.
--
-- `edited_at` records the last submitter edit specifically, so an Admin can
-- tell a visitor's correction apart from their own status writes (which only
-- move `updated_at`). It stays NULL until the first edit.
--
-- Ownership is enforced in the repository query (`id = ? and user_id = ?`),
-- which runs under the service role like the rest of this table. The
-- `(user_id, created_at desc)` index keeps the "my submissions" read cheap.

alter table public.training_applications
  add column if not exists edited_at timestamptz;

create index if not exists idx_training_applications_user_created
  on public.training_applications (user_id, created_at desc)
  where user_id is not null;
