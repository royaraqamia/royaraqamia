-- A member can exist without being listed
--
-- `public.users` had no way to say "this row is not a person the directory
-- should show". The Playwright fixture account (`e2e-test-user`) is a real,
-- verified member, so the community roster, the member search, the sitemap and
-- the chat picker listed it like any other; the account's name was the only
-- thing marking it internal (`e2e/setup-test-user.ts`).
--
-- `is_hidden` is that word, and it is deliberately not something else:
--
-- - not `verified = false`: that flag records that the address was confirmed,
--   and this account's was. Clearing it would also make the row disappear for
--   the handle-uniqueness check, `sitemap.ts` and the roster at once, which is
--   a different statement than "do not list this member";
-- - not a delete: the suite signs in as this row on every run, and
--   `posts.author_id` and the chat tables point at it. The row stays, only the
--   listing stops.
--
-- What it does (ADR-0127):
--
-- - `PublicUsersRepository.list`, `.search`, `.listVerifiedHandles` and
--   `.count` add `is_hidden = false`, so the roster, the sitemap and the chat
--   picker never name the member;
-- - `/u/<handle>` answers 404 unless the viewer is that member or an Admin;
-- - `.getByUsername`, `.getById` and `.getMany` stay unfiltered on purpose: the
--   handle-uniqueness check must still see the row, and an existing chat thread
--   must still resolve its peer's name.
--
-- The content the row authored is untouched, so a hidden member's published
-- post keeps its author byline. Hiding content is a moderation decision, not
-- this flag's job.
--
-- Rollback:
--   alter table public.users drop column if exists is_hidden;

alter table public.users
  add column is_hidden boolean not null default false;

comment on column public.users.is_hidden is
  'Not a member any public surface lists: the roster, member search, sitemap and chat picker skip the row, and /u/<handle> answers 404 to everyone but the member and an Admin. The row itself stays (ADR-0127).';

-- The fixture row that was already there. From this merge on the bootstrap sets
-- the same flag (`e2e/setup-test-user.ts`), so a re-provisioned account is
-- hidden at the source; this covers the row that exists today.
update public.users
   set is_hidden = true
 where username = 'e2e-test-user';
