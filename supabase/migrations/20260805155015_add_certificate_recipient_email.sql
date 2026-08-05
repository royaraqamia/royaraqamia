-- Optional email of the account that should be notified when this
-- certificate is issued. Stored encrypted? No - plaintext email used only to
-- match an existing auth.users record so the `certificate_issued`
-- notification reaches the right user. Unmatched emails never fail issuance.
alter table public.certificates
  add column if not exists recipient_email text;