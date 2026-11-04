# A hidden member is a row nobody lists

The Playwright fixture account is a real member. It signs in, owns rows, and its `public.users` row
is confirmed — so the community roster, the member search, the sitemap and the chat picker named it
like any other, and `/u/e2e-test-user` opened for the public. Its name was the only thing marking it
internal (`e2e/setup-test-user.ts` said so in a comment). The site's own front door was advertising
a test account.

It must not be deleted: the suite signs in as that row on every run, `posts.author_id` and the chat
tables point at it, and a missing `auth.users` row is a different failure than a quiet one.

## Decision

**A hidden member is a row nobody lists.** `public.users.is_hidden` (default `false`) marks a row
that exists and can sign in, and that no public surface names.

1. **The listing reads filter it, the row reads do not.** `PublicUsersRepository.list`, `.search`,
   `.listVerifiedHandles` and `.count` add `is_hidden = false`. `.getByUsername`, `.getById` and
   `.getMany` stay unfiltered, because they answer different questions: the handle-uniqueness check
   must still see a hidden row (a new signup may not take its handle), and an existing chat thread
   must still resolve its peer's name rather than render a nameless member.
2. **The profile route 404s to everyone but the member and an Admin.** One predicate,
   `canViewMember`, decides; the page resolves the viewer only when the row is hidden. An Admin can
   look at what a hidden row renders without reading the database, and the account keeps seeing its
   own profile while the suite uses it.
3. **It is not `verified = false`.** That flag records that the address was confirmed, and this
   account's was. Clearing it would also hide the row from the handle-uniqueness check, which is the
   wrong statement and a real bug waiting to happen. It is not `is_admin` either, and it authorizes
   nothing (`ADR-0003`).
4. **Content is untouched.** A hidden member's published post keeps its byline. Hiding a row from a
   directory is a statement about the person's presence in a list; suppressing what they wrote is a
   moderation decision with its own record, and one flag must not quietly become both.
5. **The fixture sets it at the source.** `e2e/setup-test-user.ts` writes the flag on every run, so a
   re-provisioned account is hidden without anyone remembering the dashboard. On a branch whose
   migration is not applied yet the column is absent, and that is a warning, not a failed bootstrap —
   the merge applies it.

## Consequences

- The profile route renders per request. Whether `/u/<handle>` may be opened depends on who asked, so
  the answer cannot be cached for every viewer at once; the member data under it still comes from the
  tag-invalidated loader. The alternative — a hidden row 404ing for its own account and its Admins —
  was rejected as the worse trade for one route on a site whose profiles are a small, bounded set.
- The chat picker no longer offers the account, and a hand-typed handle reaches the same answer
  (`preview` answers 404), so a new conversation with it cannot be started by hand. A thread that
  already exists keeps working: its roster resolves through `getMany`, which is deliberately
  unfiltered.
- The sitemap and the roster count agree with what a visitor can open: neither names a hidden row.
- Nothing stops an Admin from unhiding by SQL, and nothing needs to: the flag is data, not a policy.

## Alternatives considered

- **A list of hidden handles in config.** No migration, but every new listing query has to remember
  the list, and the row that must not be listed is exactly the one a new query forgets. The filter
  belongs next to the rows.
- **`verified = false`.** Zero code, wrong meaning, and it breaks the uniqueness read.
- **Deleting the row.** Breaks the suite and every foreign key, and turns a quiet decision into a
  loud one.
- **Gating the route in `proxy.ts`.** Keeps the profile route cached, but the middleware cannot answer
  `notFound()` cleanly, would need its own short-TTL copy of the hidden set, and would let a hidden
  page stay reachable for up to that TTL after the flag flips.
