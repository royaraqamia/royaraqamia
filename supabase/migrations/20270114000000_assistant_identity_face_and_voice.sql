-- ============================================================
-- The assistant's face and its voice (ADR-0228)
--
-- 20270112000000 gave the identity a name, an orb variant, a tone and a note.
-- Two of those are replaced by what the member actually edits:
--
--   * `avatar_url` — the member's uploaded image, written by its own endpoint
--     exactly as `public.users.avatar_url` is (#946). The column is nullable and
--     the orb stays the fallback, so no row changes meaning on the deploy.
--   * `voice` — how the assistant is addressed in Arabic. The name is free text,
--     so gender is stored rather than guessed from its ending; the prompt and the
--     site's labels read the same value.
--
-- `avatar_variant` stays: it is the roster's future mark and no surface draws it
-- today, so removing it would be a destructive change with no benefit.
--
-- No backfill: a member with no row reads the deployment's default, and a member
-- with a row gets the feminine voice the shipped copy already uses.
--
-- Rollback:
--   alter table public.assistant_identities
--     drop constraint if exists assistant_identities_voice,
--     drop constraint if exists assistant_identities_avatar_url_length,
--     drop column if exists avatar_url,
--     drop column if exists voice;
-- ============================================================

alter table public.assistant_identities
  add column if not exists avatar_url text,
  add column if not exists voice text not null default 'feminine';

-- The contract refuses these too; the table refuses them for any writer that is
-- not the API, including a future backfill or a hand-run query.
alter table public.assistant_identities
  add constraint assistant_identities_voice
  check (voice in ('feminine', 'masculine'));

alter table public.assistant_identities
  add constraint assistant_identities_avatar_url_length
  check (avatar_url is null or char_length(avatar_url) between 1 and 2048);

comment on column public.assistant_identities.avatar_url is
  'The member''s uploaded assistant face; null draws the orb (ADR-0228).';
comment on column public.assistant_identities.voice is
  'How the assistant is addressed: feminine or masculine (ADR-0228).';

comment on table public.assistant_identities is
  'The member''s own assistant identity (ADR-0224, ADR-0228): name, face, voice and tone. Owner-only; nothing here is public.';
