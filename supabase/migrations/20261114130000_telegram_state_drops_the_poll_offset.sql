-- ============================================================
-- The poll offset leaves with the poll
--
-- `telegram_state` was created when the bridge read updates with getUpdates:
-- one row, `update_offset`, advanced after each batch. ADR 0122 replaced that
-- with a webhook, so Telegram pushes each update and nothing has an offset to
-- remember. The key has been write-dead and read-dead since: no script, function
-- or workflow names it, and the only surviving key is `memory_cursor`, which the
-- digest actually advances.
--
-- A row nobody reads is not harmless: it is the first thing the next reader of
-- this table finds and mistakes for current state. One bounded delete removes it.
--
-- Rollback:
--   insert into public.telegram_state (key, value)
--   values ('update_offset', '0')
--   on conflict (key) do nothing;
-- ============================================================

delete from public.telegram_state
where key = 'update_offset';
