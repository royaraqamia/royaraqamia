-- ============================================================
-- Follows, and one block list for the whole site
--
-- The community feed used to be "everything everyone published". It becomes the
-- member's own feed: their posts and the posts of the members they follow, and
-- nothing else until they follow someone. That needs a follow graph, and a
-- follow graph needs the block list to mean the same thing everywhere - a
-- blocked member must not be feed-visible even if the follow row survived.
--
-- Two changes, one migration, because the second depends on the first:
--
-- 1. `chat_blocks` becomes `public.blocks`. It was always a member-to-member
--    block written by the chat surfaces; the chat prefix described the first
--    writer, not the meaning. Follows read it, the feed filter reads it, and a
--    future surface reads the same rows. The three chat call sites and the one
--    SQL function that name it are updated here, so there is no second name and
--    no compatibility view: a view would be the duplicate this change removes.
--
-- 2. `public.follows` is the graph: (follower, followee), one row per edge, the
--    pair as the primary key so a double tap is the same row rather than a
--    second one. A member cannot follow themselves. Blocking severs both
--    directions in a trigger on `blocks`, so every writer gets the rule instead
--    of only the one that happens to remember it.
--
-- Reads:
--
-- - `public.following_feed` is the personal feed's source, `security_invoker`
--   so the caller's own RLS decides what is visible, and pre-filtered to
--   "my posts + my followees' posts, minus anyone blocking me or blocked by me".
--   The block half runs through `private.not_blocked_with`, a security-definer
--   helper: a policy evaluates `blocks` with the caller's own RLS, so the owner
--   can never see the row in which they are the blocked one and the check would
--   silently do nothing. Same reason `chat_can_write` exists.
-- - `public.follow_counts` answers the two numbers a profile header draws
--   without naming a single follower. Security definer, aggregate-only, so the
--   counts are public while the lists stay private to their owner.
-- - The lists themselves are ordinary RLS reads: a member sees the rows where
--   they are the follower or the followee.
--
-- Rollback:
--   drop view if exists public.following_feed;
--   drop function if exists public.follow_counts(uuid[]);
--   drop table if exists public.follows;
--   drop trigger if exists trg_sever_follows_on_block on public.blocks;
--   drop function if exists private.sever_follows_on_block();
--   drop function if exists private.not_blocked_with(uuid, uuid);
--   alter table public.blocks rename to chat_blocks;
--   alter index if exists public.idx_blocks_blocked_id rename to idx_chat_blocks_blocked_id;
--   (then restore `chat_can_write` from 20261103090000_chats.sql)
-- ============================================================

-- ------------------------------------------------------------
-- 1. The block list belongs to the site
-- ------------------------------------------------------------

alter table public.chat_blocks rename to blocks;

-- Indexes keep their own names when a table is renamed.
alter index if exists public.idx_chat_blocks_blocked_id rename to idx_blocks_blocked_id;

comment on table public.blocks is
  'Member-to-member blocks for every surface: chat, the community feed and the follow graph. Written by the member themselves; a hidden row is one you blocked.';

-- Recompiled here because it names the table. `create or replace` keeps the
-- function's ownership and ACL, so its revoke below is unchanged.
create or replace function private.chat_can_write(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select private.chat_is_participant(p_conversation_id, p_user_id)
     and not exists (
       select 1
         from public.chat_participants peer
         join public.blocks b
           on b.blocker_id = peer.user_id
          and b.blocked_id = p_user_id
        where peer.conversation_id = p_conversation_id
          and peer.user_id <> p_user_id
     );
$$;

-- ------------------------------------------------------------
-- 2. The follow graph
-- ------------------------------------------------------------

create table if not exists public.follows (
  follower_id uuid not null references public.users (id) on delete cascade,
  followee_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);

comment on table public.follows is
  'One row per follow edge. The pair is the primary key, so following twice is the same row. Blocking deletes both directions (trg_sever_follows_on_block).';
comment on column public.follows.follower_id is 'The member who pressed متابعة.';
comment on column public.follows.followee_id is 'The member who is followed.';

-- The primary key already indexes (follower_id, …): "who do I follow" is a
-- prefix scan. This is the other direction, "who follows me", which a follower
-- count and a follower list read on every profile open.
create index if not exists idx_follows_followee_created
  on public.follows (followee_id, created_at desc);

alter table public.follows enable row level security;

-- A member reads the rows they are an end of: their followees (the following
-- list) and their followers (the follower list). Nobody can read a third
-- member's edge, which is what keeps the lists private while the counts stay
-- public through `follow_counts`.
drop policy if exists "Members read the edges they are on" on public.follows;
create policy "Members read the edges they are on"
  on public.follows for select
  to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

-- You follow as yourself, and only as yourself. The followee's consent is not a
-- column: the site has no private accounts, so a follow is always allowed
-- unless a block forbids it - and that rule is enforced in the service, where
-- the block list can be read on both sides.
drop policy if exists "Members follow as themselves" on public.follows;
create policy "Members follow as themselves"
  on public.follows for insert
  to authenticated
  with check ( follower_id = (select auth.uid()) );

drop policy if exists "Members unfollow as themselves" on public.follows;
create policy "Members unfollow as themselves"
  on public.follows for delete
  to authenticated
  using ( follower_id = (select auth.uid()) );

grant select, insert, delete on public.follows to authenticated;
-- The server's own reads (a feed page, a count on a cached profile) run on the
-- service role, which checks the viewer itself.
grant select, insert, delete on public.follows to service_role;

-- Blocking severs the graph, in both directions, whichever side the member is.
create or replace function private.sever_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

revoke all on function private.sever_follows_on_block() from public, anon, authenticated;

drop trigger if exists trg_sever_follows_on_block on public.blocks;
create trigger trg_sever_follows_on_block
  after insert on public.blocks
  for each row execute function private.sever_follows_on_block();

-- ------------------------------------------------------------
-- 3. What the personal feed reads
-- ------------------------------------------------------------

-- A security-definer helper for the same reason `chat_can_write` is one: the
-- RLS on `blocks` only shows the caller the rows they wrote, so a policy or a
-- `security_invoker` view evaluating "has either side blocked the other" would
-- only ever see one half.
create or replace function private.not_blocked_with(p_author_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select not exists (
    select 1
      from public.blocks b
     where (b.blocker_id = p_viewer_id and b.blocked_id = p_author_id)
        or (b.blocker_id = p_author_id and b.blocked_id = p_viewer_id)
  );
$$;

revoke all on function private.not_blocked_with(uuid, uuid) from public, anon, authenticated;
-- The view below is `security_invoker`, so the caller evaluates this function and
-- needs to be allowed to call it. `chat_policy_helper_grants` is the same fix for
-- the same trap in the chat policies.
grant execute on function private.not_blocked_with(uuid, uuid) to authenticated;

-- The feed's own rows: my posts and my followees' posts, minus anyone who
-- blocked me or whom I blocked. Publication state, `community_visible`,
-- tombstones, the search term and the keyset cursor stay in the repository, so
-- there is one definition of "published" for every feed and not a second one
-- in SQL.
--
-- `security_invoker` is explicit: the view must not read as its owner. A guest
-- therefore gets no rows at all (`auth.uid()` is null), which is the correct
-- answer for a surface that only exists for a signed-in member.
create or replace view public.following_feed
with (security_invoker = true) as
select
  p.id,
  p.author_id,
  p.slug,
  p.content,
  p.status,
  p.cover_image,
  p.meta_title,
  p.meta_desc,
  p.published_at,
  p.publish_at,
  p.view_count,
  p.featured,
  p.community_visible,
  p.reading_time_minutes,
  p.created_at,
  p.updated_at,
  p.deleted_at
from public.posts p
where (
    p.author_id = (select auth.uid())
    or p.author_id in (
      select f.followee_id
        from public.follows f
       where f.follower_id = (select auth.uid())
    )
  )
  and private.not_blocked_with(p.author_id, (select auth.uid()));

comment on view public.following_feed is
  'The signed-in member''s personal feed rows: their own posts plus their followees'', minus either side of a block. Publication, search and cursor filters are applied by the repository (ADR-0173).';

grant select on public.following_feed to authenticated;

-- ------------------------------------------------------------
-- 4. The two numbers a profile draws
-- ------------------------------------------------------------

-- Public counts, private lists. The aggregate is the whole point: it answers
-- "how many" without naming anyone, so a visitor can read the number on a
-- profile while the list stays behind the owner's own RLS.
create or replace function public.follow_counts(p_user_ids uuid[])
returns table (user_id uuid, followers bigint, following bigint)
language sql
stable
security definer
set search_path = 'public'
as $$
  select u.id,
         (select count(*) from public.follows f where f.followee_id = u.id),
         (select count(*) from public.follows f where f.follower_id = u.id)
    from public.users u
   where u.id = any(p_user_ids);
$$;

comment on function public.follow_counts(uuid[]) is
  'Follower and following counts for a set of members, in one read. Aggregate only: the lists themselves are RLS-scoped to their owner.';

revoke all on function public.follow_counts(uuid[]) from public;
grant execute on function public.follow_counts(uuid[]) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. A new follower is a notification
-- ------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
    check (type in (
      'certificate_issued',
      'habit_reminder',
      'recovery_nudge',
      'expense_alert',
      'link_clicked',
      'system_announcement',
      'training_application',
      'consultation_booking',
      'project_request',
      'retainer_request',
      'subscription_request',
      'chat_request',
      'new_follower'
    ));
