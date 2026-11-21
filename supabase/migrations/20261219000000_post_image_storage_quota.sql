-- ============================================================
-- A ceiling for the last member upload path (#1691)
--
-- `post-images` was the only bucket a member could fill without a byte cap:
-- the route checked one file against 5 MB and then published it forever. The
-- 5 MB bucket limit bounds a file, not the count of files, and `plan_limits`
-- has no storage row. Chat already counts what Storage holds through
-- `private.enforce_chat_attachment_quota`; this is the same rule for the other
-- public bucket, with the numbers on `app_settings` so they can move without a
-- deploy.
--
-- Two meters, two numbers:
--   per member   100 MB  the same allowance a chat member gets for files
--   project      500 MB  the same wall the project has for chat attachments
--
-- Storage writes an object in two steps: an INSERT with no metadata to check
-- RLS, then a second write (an upsert, seen as an INSERT or an UPDATE depending
-- on the Storage version) that fills `metadata` with the number of bytes it
-- actually stored. The trigger therefore watches both events and does nothing
-- until that number exists — it never trusts the client's declared size. A
-- refusal raises, rolling the write back so an over-cap object is not left
-- published. The folder is the owner: every name is built as
-- `<user id>/<uuid>.<ext>`, which is also the bucket policies' ownership test.
--
-- Rollback:
--   drop trigger if exists enforce_post_image_quota on storage.objects;
--   drop function if exists private.enforce_post_image_quota();
--   drop function if exists public.post_image_allowance();
--   alter table public.app_settings
--     drop column if exists post_image_member_bytes,
--     drop column if exists post_image_project_bytes;
-- ============================================================

-- ------------------------------------------------------------
-- The numbers
-- ------------------------------------------------------------

alter table public.app_settings
  add column if not exists post_image_member_bytes bigint not null default 104857600,
  add column if not exists post_image_project_bytes bigint not null default 524288000;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_post_image_allowances'
  ) then
    alter table public.app_settings
      add constraint app_settings_post_image_allowances
      check (
        post_image_member_bytes > 0
        and post_image_project_bytes > 0
        and post_image_member_bytes <= post_image_project_bytes
      );
  end if;
end;
$$;

-- ------------------------------------------------------------
-- The write-time ceiling
-- ------------------------------------------------------------

create or replace function private.enforce_post_image_quota()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member_limit bigint;
  v_project_limit bigint;
  v_owner        text;
  v_bytes        bigint;
  v_member_used  bigint;
  v_project_used bigint;
begin
  if new.bucket_id <> 'post-images' then
    return new;
  end if;

  select s.post_image_member_bytes, s.post_image_project_bytes
    into v_member_limit, v_project_limit
    from public.app_settings s
   where s.id;

  v_owner := (storage.foldername(new.name))[1];

  -- The first INSERT of an upload has no metadata; Storage records the bytes in
  -- the second write. Wait for it rather than refuse an upload before it has a
  -- measurable object. The digits-only test bounds the cast below bigint's
  -- ceiling and keeps a malformed value from raising a cast error.
  if new.metadata is null or new.metadata->>'size' !~ '^[0-9]{1,18}$' then
    return new;
  end if;
  v_bytes := (new.metadata->>'size')::bigint;

  if v_owner is null or v_owner = '' then
    return new;
  end if;

  -- Serialise uploads to this bucket: two members reading the same project
  -- total in the same instant must not both pass the wall.
  perform pg_advisory_xact_lock(hashtextextended('post-images-quota', 0));

  -- Exclude this row: it is already in the sum, and its size is the bytes being
  -- added. Storage's two-write upload can also change the object's id.
  select coalesce(sum(case when (storage.foldername(o.name))[1] = v_owner
                            then (o.metadata->>'size')::bigint else 0 end), 0)::bigint,
         coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
    into v_member_used, v_project_used
    from storage.objects o
   where o.bucket_id = 'post-images'
     and o.id <> new.id
     and o.metadata->>'size' ~ '^[0-9]{1,18}$';

  if v_member_used + v_bytes > v_member_limit then
    raise exception 'post image member storage is full' using errcode = '53400';
  end if;

  if v_project_used + v_bytes > v_project_limit then
    raise exception 'post image project storage is full' using errcode = '53400';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_post_image_quota() from public, anon, authenticated;

drop trigger if exists enforce_post_image_quota on storage.objects;
create trigger enforce_post_image_quota
  after insert or update of metadata on storage.objects
  for each row execute function private.enforce_post_image_quota();

-- ------------------------------------------------------------
-- What the service reads before it uploads
-- ------------------------------------------------------------

-- The preflight, not the authority: the trigger above is what actually bounds
-- the bucket. This lets the service answer with the product's sentence instead
-- of a raw Storage error, and keeps the meters in one place.
create or replace function public.post_image_allowance()
returns table (
  member_used_bytes   bigint,
  member_limit_bytes  bigint,
  project_used_bytes  bigint,
  project_limit_bytes bigint
)
language sql
stable
security definer
set search_path = 'public'
as $$
  select coalesce((
           select sum((o.metadata->>'size')::bigint)
             from storage.objects o
            where o.bucket_id = 'post-images'
              and (storage.foldername(o.name))[1] = (select auth.uid())::text
              and o.metadata->>'size' ~ '^[0-9]{1,18}$'
         ), 0)::bigint,
         s.post_image_member_bytes,
         coalesce((
           select sum((o.metadata->>'size')::bigint)
             from storage.objects o
            where o.bucket_id = 'post-images'
              and o.metadata->>'size' ~ '^[0-9]{1,18}$'
         ), 0)::bigint,
         s.post_image_project_bytes
    from public.app_settings s
   where s.id;
$$;

revoke all on function public.post_image_allowance() from public, anon;
grant execute on function public.post_image_allowance() to authenticated;
