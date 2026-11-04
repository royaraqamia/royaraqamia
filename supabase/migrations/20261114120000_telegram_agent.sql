-- ============================================================
-- The Telegram bot is an agent: state it needs that Postgres did not hold yet
--
-- Until now a message was stored, dispatched, and answered by one chat
-- completion: no repository, no tools, no side effects worth confirming. The
-- agent (ADR 0129) changes three things about the row it keeps:
--
--   - a message can carry a picture or a document, not only text and a voice
--     note, so the two file ids are stored beside `voice_file_id`;
--   - a run can be stopped from the chat while it is working, so
--     `cancel_requested` is a column rather than a workflow cancel - the run
--     reads it between steps, which is the only way a tap reaches a run that is
--     already in flight;
--   - the owner can say "this answer was wrong", so `feedback` records the
--     reaction that says it.
--
-- Two new tables:
--
--   - `telegram_confirmations` is the two taps in front of a merge. It holds the
--     pull request and the step, so the second tap can arrive in a different
--     workflow run from the first, and `expires_at` is what stops a button on an
--     old message from merging anything at all. Nothing else may call the merge.
--   - `telegram_callbacks` makes a button press exactly-once: Telegram redelivers
--     a callback query when the webhook is slow, and answering it twice would
--     otherwise advance a confirmation twice.
--
-- And `dispatch_github_workflow` gains inputs, because the merge run needs to be
-- told which confirmation row it is completing.
--
-- Rollback:
--   revoke execute on function public.dispatch_github_workflow(text, text, jsonb) from service_role;
--   drop function if exists public.dispatch_github_workflow(text, text, jsonb);
--   drop table if exists public.telegram_callbacks;
--   drop table if exists public.telegram_confirmations;
--   alter table public.telegram_messages
--     drop column if exists photo_file_id,
--     drop column if exists document_file_id,
--     drop column if exists cancel_requested,
--     drop column if exists feedback,
--     drop column if exists run_url;
-- ============================================================

alter table public.telegram_messages
  add column if not exists photo_file_id text,
  add column if not exists document_file_id text,
  -- A tap sets this; the agent reads it between steps and stops.
  add column if not exists cancel_requested boolean not null default false,
  -- 'down' is the one value that means "this answer was wrong".
  add column if not exists feedback text,
  add column if not exists run_url text,
  -- Telegram's own id for the message we sent, so a reaction can find its row.
  add column if not exists telegram_message_id bigint;

create index if not exists idx_telegram_messages_telegram_id
  on public.telegram_messages (telegram_message_id)
  where telegram_message_id is not null;

create table if not exists public.telegram_confirmations (
  id bigserial primary key,
  chat_id bigint not null,
  -- The message the buttons sit under, for a follow-up edit.
  message_id bigint,
  kind text not null check (kind in ('merge')),
  -- The pull request number, as text so a future kind can name something else.
  target text not null,
  step integer not null default 1 check (step between 1 and 2),
  outcome text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_telegram_confirmations_open
  on public.telegram_confirmations (chat_id, created_at desc)
  where completed_at is null;

create table if not exists public.telegram_callbacks (
  -- Telegram's own id: the unique constraint is the exactly-once guarantee.
  callback_id text primary key,
  chat_id bigint not null,
  message_id bigint,
  data text not null,
  created_at timestamptz not null default now()
);

alter table public.telegram_confirmations enable row level security;
alter table public.telegram_callbacks enable row level security;

revoke all on public.telegram_confirmations from anon, authenticated;
revoke all on public.telegram_callbacks from anon, authenticated;

grant all on public.telegram_confirmations to service_role;
grant all on public.telegram_callbacks to service_role;

grant usage, select on sequence public.telegram_confirmations_id_seq to service_role;

/*
 * The dispatcher, now with inputs.
 *
 * The Edge Function calls this with the workflow name and, for a confirmed
 * merge, the confirmation id. The inputs travel as one jsonb object because the
 * Actions API takes an object and adding a column per future input would be a
 * migration every time.
 */
create or replace function public.dispatch_github_workflow(
  p_workflow text,
  p_ref text default 'main',
  p_inputs jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  v_repo text;
  v_token text;
begin
  select decrypted_secret into v_repo
  from vault.decrypted_secrets
  where name = 'github_dispatch_repo'
  limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token'
  limit 1;

  -- Absent token: no-op rather than a failure. The workflow's own schedule and
  -- the health monitor still exist, and a dispatcher that throws would make
  -- every caller's transaction fail for a reason it cannot fix.
  if v_repo is null or v_token is null or v_repo = '' or v_token = '' then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/' || v_repo || '/actions/workflows/' || p_workflow || '/dispatches',
    body := jsonb_build_object('ref', p_ref, 'inputs', coalesce(p_inputs, '{}'::jsonb)),
    headers := jsonb_build_object(
      'Accept', 'application/vnd.github+json',
      'Authorization', 'Bearer ' || v_token,
      'X-GitHub-Api-Version', '2022-11-28',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 5000
  );
end;
$fn$;

revoke execute on function public.dispatch_github_workflow(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.dispatch_github_workflow(text, text, jsonb) to service_role;

/*
 * The two-argument form is dropped rather than left beside the new one: with both
 * present, a call naming two arguments is ambiguous and `wake_telegram_bridge`
 * would fail at run time. Every caller resolves to the three-argument form, whose
 * third argument defaults to an empty object.
 */
drop function if exists public.dispatch_github_workflow(text, text);

-- Confirmations expire on their own: the sweeper removes finished rows and any
-- row too old to be tapped, so a stale button can never find its row.
create or replace function public.sweep_telegram_confirmations()
returns void
language sql
security definer
set search_path = 'public'
as $fn$
  delete from public.telegram_confirmations
  where expires_at < now() - interval '7 days'
     or (completed_at is not null and completed_at < now() - interval '7 days');

  delete from public.telegram_callbacks
  where created_at < now() - interval '7 days';
$fn$;

revoke execute on function public.sweep_telegram_confirmations() from public, anon, authenticated;

do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'telegram-confirmations-prune') then
    perform cron.schedule(
      'telegram-confirmations-prune',
      '40 3 * * *',
      $$select public.sweep_telegram_confirmations()$$
    );
  end if;
end;
$do$;
