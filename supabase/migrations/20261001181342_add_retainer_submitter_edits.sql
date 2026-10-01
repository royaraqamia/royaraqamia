-- Submitter edits for retainers.
--
-- A signed-in visitor now has an account-based path to edit their own retainer
-- request after submitting it (`/account/submissions`). Every visitor field is
-- replaceable; `status`, `notes`, `monthly_fee_usd`, `paid_through`,
-- `reference_code` and `user_id` stay server/Admin-owned.
--
-- `edited_at` records the last submitter edit specifically, so an Admin can
-- tell a visitor's correction apart from their own status/terms writes (which
-- only move `updated_at`). It stays NULL until the first edit.
--
-- Ownership is enforced in the repository query (`id = ? and user_id = ?`),
-- which runs under the service role like the rest of this table. The
-- `(user_id, created_at desc)` index keeps the "my submissions" read cheap.

alter table public.retainers
  add column if not exists edited_at timestamptz;

create index if not exists idx_retainers_user_created
  on public.retainers (user_id, created_at desc)
  where user_id is not null;
