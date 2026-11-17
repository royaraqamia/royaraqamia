-- ============================================================
-- A message may carry the sources it was written from (ADR-0205)
--
-- The assistant's reply cites the web as [1], [2]; the card under it is the
-- same array. Storing it on the row is what makes reopening a thread show the
-- evidence the answer had, instead of an answer with three unnumbered brackets.
--
-- Nullable and unindexed on purpose: it is a render payload, never queried. A
-- member's own rows never carry it, and the column is not exposed to a wider
-- reader than the message it belongs to.
--
-- Rollback:
--   alter table public.chat_messages drop column if exists sources;
-- ============================================================

alter table public.chat_messages
  add column if not exists sources jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_sources_array'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_sources_array
      check (sources is null or jsonb_typeof(sources) = 'array');
  end if;
end;
$$;
