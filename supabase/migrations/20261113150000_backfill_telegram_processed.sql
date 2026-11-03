-- ============================================================
-- Mark the rows the polling code already answered
--
-- `processed_at` arrived with the webhook (20261113140000), but rows written
-- before it were stored without the column by the polling code, which answered
-- them and left them looking unprocessed. The first drain after the deploy
-- therefore replayed four already-answered messages - visible in the chat as a
-- burst of identical replies on 2026-11-03 at 19:10 UTC.
--
-- The cut is the moment the webhook went live (`setWebhook` answered
-- `{"ok":true}` at 19:20:44 UTC). Everything inbound before that was written by
-- polling and answered then; everything after is claimed normally. Idempotent:
-- running it again matches nothing, and a fresh project has nothing to match.
--
-- Rollback: none needed - the update only sets a timestamp on rows the old path
-- had already handled. Re-running it is a no-op, and there is no data lost.
-- ============================================================

update public.telegram_messages
set processed_at = coalesce(created_at, now())
where direction = 'in'
  and processed_at is null
  and created_at < timestamptz '2026-11-03 19:20:44+00';
