-- Targeted recipients for certificate notifications. Stored as an array of
-- user ids so the selection is auditable and visible when editing. Empty array
-- means no in-app notification is fired on issuance (legacy behavior).
alter table public.certificates
  add column if not exists recipient_user_ids uuid[] not null default '{}';