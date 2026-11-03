-- ============================================================
-- Evidence on demand, and voice notes as text
--
-- Two additions to the same door.
--
-- `telegram_lookups` is the escalation queue. The chat answers in about two
-- seconds with no tools, because that is what makes it feel like a conversation.
-- When the model decides a question needs evidence, it says so instead of
-- inventing an answer: one row lands here, the owner is told "سأتحقق", and the
-- next run gathers the evidence from the checkout or the web and answers.
--
-- `voice_file_id` / `voice_duration` on `telegram_messages` are how a voice note
-- survives the webhook. The function cannot download or transcribe - it has
-- seconds and no model - so it stores the file id and the drain run does the
-- work with the bot token it already holds.
--
-- Rollback:
--   drop table if exists public.telegram_lookups;
--   alter table public.telegram_messages drop column if exists voice_file_id;
--   alter table public.telegram_messages drop column if exists voice_duration;
-- ============================================================

alter table public.telegram_messages
  add column if not exists voice_file_id text,
  add column if not exists voice_duration integer;

create table if not exists public.telegram_lookups (
  id bigserial primary key,
  chat_id bigint not null,
  -- 'repo' reads the checkout, 'web' fetches the page or the search results.
  source text not null check (source in ('repo', 'web')),
  query text not null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_lookups_pending
  on public.telegram_lookups (id)
  where answered_at is null;

alter table public.telegram_lookups enable row level security;

revoke all on public.telegram_lookups from anon, authenticated;
grant all on public.telegram_lookups to service_role;
grant usage, select on sequence public.telegram_lookups_id_seq to service_role;

/**
 * The same wake-up as before, now also counting a pending lookup. Kept in this
 * migration rather than edited in place because the earlier version is already
 * applied to production.
 */
create or replace function public.wake_telegram_bridge()
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  pending integer;
begin
  select count(*) into pending
  from public.telegram_messages
  where direction = 'in' and processed_at is null;

  if pending = 0 then
    select count(*) into pending
    from public.telegram_reminders
    where sent_at is null and due_at <= now();
  end if;

  if pending = 0 then
    select count(*) into pending
    from public.telegram_lookups
    where answered_at is null;
  end if;

  if pending > 0 then
    perform public.dispatch_github_workflow('telegram.yml', 'main');
  end if;
end;
$fn$;

revoke execute on function public.wake_telegram_bridge()
  from public, anon, authenticated;
