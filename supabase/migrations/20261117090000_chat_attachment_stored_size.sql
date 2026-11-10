-- ============================================================
-- The attachment caps sum what Storage holds, not what the client says (#1077)
--
-- `public.chat_attachments.byte_size` arrived from the request body and every
-- cap in `private.enforce_chat_attachment_quota` summed it: a member could post
-- `byteSize: 1` for a 10 MB object and spend the project's storage while their
-- own meter read almost nothing, or post a large number for a tiny file and
-- inflate the shared project meter until everyone was refused.
--
-- The object is the only witness to its own size, so the trigger now reads it
-- from `storage.objects.metadata->>'size'` — the number Storage recorded when
-- the file was uploaded — and writes it over `new.byte_size`. The client's
-- number is replaced, never compared: a low declaration is recorded as the real
-- bytes instead of losing the send, a high one is corrected the same way, and
-- the four caps below sum the stored bytes either way.
--
-- An object Storage cannot name (or whose size it never recorded) is refused
-- rather than stored unmeasured: a row the caps cannot account for is the hole
-- this closes. The composer already uploaded the file before it sends the
-- message, so a legitimate send always has one.
--
-- Rollback:
--   recreate private.enforce_chat_attachment_quota() as it stands in
--     20261106090000_chat_attachment_allowances.sql;
-- ============================================================

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
  v_stored  bigint;
begin
  select s.chat_attachment_file_bytes,
         s.chat_attachment_daily_bytes,
         s.chat_attachment_member_bytes,
         s.chat_attachment_project_bytes
    into v_file, v_daily, v_member, v_project
    from public.app_settings s
   where s.id;

  -- The digits-only test keeps a malformed metadata value a refusal (null)
  -- rather than a cast error, and bounds it below bigint's ceiling.
  select case
           when o.metadata->>'size' ~ '^[0-9]{1,18}$'
             then (o.metadata->>'size')::bigint
         end
    into v_stored
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and o.name = new.storage_path;

  if v_stored is null then
    raise exception 'chat attachment size is unknown' using errcode = '53400';
  end if;

  new.byte_size := v_stored;

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
