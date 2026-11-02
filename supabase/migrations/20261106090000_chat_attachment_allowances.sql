-- ============================================================
-- Attachment allowances the Free plan can survive (ADR-0113, #852)
--
-- Both providers are on Free until ten Pro members land. Supabase Free gives a
-- project 1 GB of file storage in total, and Vercel Hobby hard-caps at 4
-- CPU-hours; text is cheap there (a message row is ~1 KB with its indexes), files
-- are not (one 24 MB file is 2.4% of the project's entire allowance). So the caps
-- are on files, and they are lower than the 1 GB per member the table allowed:
-- one member could otherwise spend the project's whole budget while their own
-- meter read "0% used".
--
-- The numbers are settings, not constants: a row a person can update after the
-- Pro subscription, with no deploy. A trigger cannot read environment variables,
-- which is why they live here rather than in `backend/config/env`.
--
--   per file        10 MB   (also the bucket's hard limit — storage cannot read
--                            a settings row, so raising this is a migration)
--   per member/day  50 MB   reset at Damascus midnight, the app's day
--   per member      100 MB  (the 1 GB ceiling stays the absolute maximum)
--   project total   500 MB  the wall: files are refused, text continues
--
-- The per-file ceiling is `CHAT_ATTACHMENT_MAX_BYTES` (25 MB) in
-- `shared/contracts/chat.ts`; a settings row can configure anything below it.
--
-- Rollback:
--   drop function if exists public.chat_attachment_allowance();
--   recreate private.enforce_chat_attachment_quota as it stands in
--     20261103090000_chats.sql;
--   alter table public.app_settings
--     drop column if exists chat_attachment_file_bytes,
--     drop column if exists chat_attachment_daily_bytes,
--     drop column if exists chat_attachment_member_bytes,
--     drop column if exists chat_attachment_project_bytes;
--   update storage.buckets set file_size_limit = 26214400
--    where id = 'chat-attachments';
-- ============================================================

-- ------------------------------------------------------------
-- The numbers
-- ------------------------------------------------------------

alter table public.app_settings
  add column if not exists chat_attachment_file_bytes bigint not null default 10485760,
  add column if not exists chat_attachment_daily_bytes bigint not null default 52428800,
  add column if not exists chat_attachment_member_bytes bigint not null default 104857600,
  add column if not exists chat_attachment_project_bytes bigint not null default 524288000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_chat_attachment_allowances'
  ) then
    alter table public.app_settings
      add constraint app_settings_chat_attachment_allowances
      check (
        chat_attachment_file_bytes > 0
        and chat_attachment_file_bytes <= 26214400
        and chat_attachment_daily_bytes > 0
        and chat_attachment_member_bytes > 0
        and chat_attachment_member_bytes <= 1073741824
        and chat_attachment_daily_bytes <= chat_attachment_member_bytes
        and chat_attachment_project_bytes > 0
      );
  end if;
end;
$$;

-- The bucket is the one cap storage itself enforces, so it must not be larger
-- than what the trigger will accept. It is a migration rather than a setting
-- because Storage reads the bucket row, not `app_settings`.
update storage.buckets
   set file_size_limit = (select chat_attachment_file_bytes from public.app_settings where id)
 where id = 'chat-attachments';

-- ------------------------------------------------------------
-- One trigger, four refusals
-- ------------------------------------------------------------

create or replace function private.enforce_chat_attachment_quota()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_file    bigint;
  v_daily   bigint;
  v_member  bigint;
  v_project bigint;
  v_today   bigint;
  v_used    bigint;
  v_all     bigint;
begin
  select s.chat_attachment_file_bytes,
         s.chat_attachment_daily_bytes,
         s.chat_attachment_member_bytes,
         s.chat_attachment_project_bytes
    into v_file, v_daily, v_member, v_project
    from public.app_settings s
   where s.id;

  -- Each refusal carries its own sentence, because the composer names the line
  -- that was crossed: the file, the day, the member's storage, or the project's.
  if new.byte_size > v_file then
    raise exception 'chat attachment file is too large' using errcode = '53400';
  end if;

  select coalesce(sum(a.byte_size), 0)
    into v_today
    from public.chat_attachments a
   where a.uploader_id = new.uploader_id
     and a.created_at >= private.damascus_day_start();

  if v_today + new.byte_size > v_daily then
    raise exception 'chat attachment daily allowance reached' using errcode = '53400';
  end if;

  select coalesce(sum(a.byte_size) filter (where a.uploader_id = new.uploader_id), 0),
         coalesce(sum(a.byte_size), 0)
    into v_used, v_all
    from public.chat_attachments a;

  if v_used + new.byte_size > v_member then
    raise exception 'chat attachment storage is full' using errcode = '53400';
  end if;

  if v_all + new.byte_size > v_project then
    raise exception 'chat attachment project storage is full' using errcode = '53400';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_chat_attachment_quota() from public, anon, authenticated;

-- ------------------------------------------------------------
-- What the composer reads
-- ------------------------------------------------------------

-- One call answers all three meters the composer shows, for the caller only.
-- Security definer because the project total is not a number any member's RLS
-- can see, and because `app_settings` has no client read path.
create or replace function public.chat_attachment_allowance()
returns table (
  file_bytes         bigint,
  today_used_bytes   bigint,
  today_limit_bytes  bigint,
  total_used_bytes   bigint,
  total_limit_bytes  bigint,
  project_used_bytes bigint,
  project_limit_bytes bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select s.chat_attachment_file_bytes,
         coalesce((
           select sum(a.byte_size)
             from public.chat_attachments a
            where a.uploader_id = (select auth.uid())
              and a.created_at >= private.damascus_day_start()
         ), 0)::bigint,
         s.chat_attachment_daily_bytes,
         coalesce((
           select sum(a.byte_size)
             from public.chat_attachments a
            where a.uploader_id = (select auth.uid())
         ), 0)::bigint,
         s.chat_attachment_member_bytes,
         coalesce((select sum(a.byte_size) from public.chat_attachments a), 0)::bigint,
         s.chat_attachment_project_bytes
    from public.app_settings s
   where s.id;
$$;

revoke all on function public.chat_attachment_allowance() from public, anon;
grant execute on function public.chat_attachment_allowance() to authenticated;
