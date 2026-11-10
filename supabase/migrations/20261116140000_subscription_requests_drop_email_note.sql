-- ============================================================
-- subscription_requests: drop the two optional questions
--
-- The «اشترِك الآن» form asks for a name and a WhatsApp number, and nothing
-- else. The email and «ما الذي ستعمل عليه؟» answers were optional from the
-- start, so the columns held mostly nulls, and the Admin arranges activation on
-- WhatsApp either way.
--
-- The reader's own answers are a record of what was submitted and were never
-- editable, so this is a pure subtraction: the table keeps the account, the
-- reference code, the lifecycle state and the Admin's own notes.
--
-- Rollback: `alter table public.subscription_requests add column email text,
-- add column note text;` (the dropped values are not recoverable).
-- ============================================================

alter table public.subscription_requests
  drop column if exists email,
  drop column if exists note;
