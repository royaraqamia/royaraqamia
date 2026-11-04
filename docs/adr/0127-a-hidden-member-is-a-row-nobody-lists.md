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
2. **Hidden means absent, and absent is cacheable.** `loadCommunityMember` answers `null` for a
   hidden row, so `/u/<handle>` is the same 404 a handle that never existed gets — decided from the
   row alone, never from who is asking. The profile route therefore keeps its ISR entry
   (`revalidate = 300`): the first request for a hidden handle renders the 404 and the next ones are
   served from cache, exactly like a listed profile. There is no viewer exemption on that URL.
3. **The exemption is where a per-viewer cost would have gone.** Letting the member or an Admin open
   a hidden profile means the answer depends on the request, which takes every profile page off the
   ISR path — at thousands of members, crawled from the sitemap, that is the kind of invocation and
   CPU this site budgets for (`docs/performance.md`). Admins read a hidden row in the admin screens
   or the database, and the account itself has `/account`; a rendered privileged preview, if it is
   ever wanted, belongs behind its own dynamic route rather than as a tax on every profile view.
4. **It is not `verified = false`.** That flag records that the address was confirmed, and this
   account's was. Clearing it would also hide the row from the handle-uniqueness check, which is the
   wrong statement and a real bug waiting to happen. It is not `is_admin` either, and it authorizes
   nothing (`ADR-0003`).
5. **Content is untouched.** A hidden member's published post keeps its byline. Hiding a row from a
   directory is a statement about the person's presence in a list; suppressing what they wrote is a
   moderation decision with its own record, and one flag must not quietly become both.
6. **The fixture sets it at the source.** `e2e/setup-test-user.ts` writes the flag on every run, so a
   re-provisioned account is hidden without anyone remembering the dashboard. On a branch whose
   migration is not applied yet the column is absent, and that is a warning, not a failed bootstrap —
   the merge applies it.

## Consequences

- The route table is unchanged: `/community` and `/sitemap.xml` stay `○` with a 5-minute revalidate,
  and `/u/[username]` stays on the same ISR path it always had.
- A hidden handle's 404 is cached like any profile, so a flag flip is visible after the profile's own
  revalidate window rather than instantly. That is the same 5 minutes a name or bio edit waits, and
  nothing in the flag is a safety control.
- The chat picker no longer offers the account, and a hand-typed handle reaches the same answer
  (`preview` rejects a hidden row), so a new conversation with it cannot be started. A thread that
  already exists keeps working: its roster resolves through `getMany`, which is deliberately
  unfiltered.
- Nothing in the product needs the account's public page: the suite signs in and uses `/account`, and
  no spec visits `/u/<fixture>`.
- Nothing stops an Admin from unhiding by SQL, and nothing needs to: the flag is data, not a policy.

## Alternatives considered

- **A viewer exemption on `/u/<handle>` (member and Admin).** The branch first shipped this: the page
  resolved the session and called `notFound()` for everybody else. It works, and it makes the route
  per request — one invocation per profile view, and a session read whenever the row is hidden. With
  17 listed members that cost nothing measurable; at the scale this site is designed for it is the
  one read that a directory should never make uncacheable. Rejected for the cached answer.
- **A privileged preview route.** A second, dynamic route that renders the same profile for the
  member or an Admin would keep the public page cached and still give a rendered view. Deliberately
  not built: nothing needs it yet, and it is the kind of surface that should arrive with a reason.
- **A list of hidden handles in config.** No migration, but every new listing query has to remember
  the list, and the row that must not be listed is exactly the one a new query forgets. The filter
  belongs next to the rows.
- **`verified = false`.** Zero code, wrong meaning, and it breaks the uniqueness read.
- **Deleting the row.** Breaks the suite and every foreign key, and turns a quiet decision into a
  loud one.
- **Gating the route in `proxy.ts`.** Keeps the profile route cached, but the middleware cannot answer
  `notFound()` cleanly, would need its own short-TTL copy of the hidden set, and would let a hidden
  page stay reachable for up to that TTL after the flag flips.
