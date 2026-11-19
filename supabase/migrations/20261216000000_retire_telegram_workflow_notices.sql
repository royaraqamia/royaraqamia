-- ============================================================
-- Retire the Telegram workflow notices
--
-- The digest and the red-check alert were the bot reporting on what other
-- workflows were doing. Both are gone from `.github/workflows/telegram.yml` and
-- `scripts/telegram/jobs.mjs` (ADR 0209), so nothing writes these tables any
-- more. The `telegram-bridge-digest-tick` cron would keep dispatching a workflow
-- with no job to run, and the two receipt tables would keep rows nobody reads.
-- This removes that machinery, not the conversation: `telegram_messages`,
-- `telegram_summaries`, `telegram_memories` and `telegram_reminders` are untouched.
--
-- Rollback: restore the digest and alert jobs, recreate the tables from
-- 20261113170000_telegram_digest_receipts.sql and
-- 20261115140000_telegram_digest_items.sql, and reschedule the tick:
--   select cron.schedule('telegram-bridge-digest-tick', '15,45 * * * *',
--     $$select public.dispatch_github_workflow('telegram.yml', 'main')$$);
-- ============================================================

select cron.unschedule('telegram-bridge-digest-tick');

drop table if exists public.telegram_digest_items;
drop table if exists public.telegram_digests;

delete from public.telegram_state where key = 'digest_items_seeded';
