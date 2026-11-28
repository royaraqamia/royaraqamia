-- ============================================================
-- A post records the artifact it was drafted from (#1952)
--
-- The community's supply is the text the product already produces: a note a
-- member wrote and an answer نور wrote for them. «انشر في المجتمع» turns one of
-- those into a draft, and the draft has to say so: without a marker the 60-day
-- review cannot tell an artifact post from a hand-written one, and the decision
-- to keep the artifact door (or close it) rests on exactly that comparison.
--
-- `source_kind` is null for every post a member typed in the composer, so the
-- existing four rows keep meaning "hand-written" without a backfill.
--
-- Rollback:
--   alter table public.posts drop constraint if exists posts_source_kind_check;
--   drop index if exists public.idx_posts_source_kind;
--   alter table public.posts drop column if exists source_ref;
--   alter table public.posts drop column if exists source_kind;
-- ============================================================

alter table public.posts
  add column if not exists source_kind text,
  add column if not exists source_ref text;

-- Two doors produce an artifact today: a note and an assistant answer. A value
-- outside this list is a bug in the writer, not a new kind of supply.
alter table public.posts
  add constraint posts_source_kind_check
  check (source_kind is null or source_kind in ('note', 'answer'));

-- The source is a record of where the row came from, not a user-editable field.
-- The artifact door sets it once, at creation; neither the editor nor the sync
-- replay carries it, so no client write can move it (see `upsert_post`, whose
-- conflict branch does not name the column).
comment on column public.posts.source_kind is
  'The artifact a draft was created from (#1952): note, answer, or null for one written in the composer.';
comment on column public.posts.source_ref is
  'The id of the note or chat message the draft came from.';

-- The review groups by kind; a partial index keeps the hand-written majority out.
create index if not exists idx_posts_source_kind
  on public.posts (source_kind)
  where source_kind is not null;
