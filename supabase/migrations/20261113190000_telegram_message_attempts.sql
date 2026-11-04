-- ============================================================
-- A voice note gets three attempts, not infinite ones
--
-- On 2026-11-04 the audio endpoint answered 503 twice, and every retry released
-- the row, so the same note was re-processed every five minutes and the owner got
-- the same error three times. A transient outage deserves a retry; a permanent
-- one deserves one apology.
--
-- `attempts` counts the failures; the drain releases the row while the count is
-- below the limit and marks it processed afterwards, so the retry loop always
-- terminates and the chat is told once.
--
-- Rollback:
--   alter table public.telegram_messages drop column if exists attempts;
-- ============================================================

alter table public.telegram_messages
  add column if not exists attempts integer not null default 0;
