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
2. **Hidden means absent.** `loadCommunityMember` answers `null` for a hidden row, so `/u/<handle>`
   is the same 404 a handle nobody owns gets — decided from the row, never from who is asking.
3. **No viewer exemption.** Letting the member or an Admin open a hidden profile puts a session read
   on every hidden-profile request and makes the answer a property of the request. The profile route
   is already `ƒ`
   (`revalidate = 300`, no `generateStaticParams` — measured: it is absent from
   `.next/prerender-manifest.json` and renders per request, exactly as on `main`), so this change
   costs the route nothing; an exemption would be the first thing standing between it and the cache
   it should eventually get. Admins read a hidden row in the admin screens or the database, and the
   account itself has `/account`.
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

- Nothing gets slower, and nothing gets faster by accident: `/community` and `/sitemap.xml` keep their
  `○ … 5m` entry, and `/u/[username]` was `ƒ` before this change and stays `ƒ`. What the route no
  longer does is resolve a session — so the hidden case costs the same as any other profile read.
- A hidden handle's page is the ordinary profile path with a `null` under it, so a flag flip shows up
  when the loader's own cache turns over (300 seconds, tag `memberByUsername`), the same window a name
  or bio edit waits. Nothing in the flag is a safety control.
- The chat picker no longer offers the account, and a hand-typed handle reaches the same answer
  (`preview` rejects a hidden row), so a new conversation with it cannot be started. A thread that
  already exists keeps working: its roster resolves through `getMany`, which is deliberately
  unfiltered.
- Nothing in the product needs the account's public page: the suite signs in and uses `/account`, and
  no spec visits `/u/<fixture>`.
- The profiles' own caching is a separate decision, and it has been taken: `generateStaticParams` over
  the roster ([ADR-0128](0128-a-profile-is-prerendered-from-the-roster.md)) makes `/u/[username]` a
  prerendered page with a 5-minute window, and a hidden member is simply not in the roster the build
  draws from.
- Nothing stops an Admin from unhiding by SQL, and nothing needs to: the flag is data, not a policy.

## Alternatives considered

- **A viewer exemption on `/u/<handle>` (member and Admin).** The branch first shipped this: the page
  resolved the session and called `notFound()` for everybody else. It reads well and it works, but it
  makes the answer a property of the request, puts a Supabase session read on the hidden path, and
  makes the route uncacheable by construction — for two internal viewers, one of which never opens
  the page. Rejected.
- **A privileged preview route.** A second, dynamic route that renders the same profile for the
  member or an Admin keeps the public page viewer-independent and still gives a rendered view.
  Deliberately not built: nothing needs it yet, and it is the kind of surface that should arrive with
  a reason.
- **A list of hidden handles in config.** No migration, but every new listing query has to remember
  the list, and the row that must not be listed is exactly the one a new query forgets. The filter
  belongs next to the rows.
- **`verified = false`.** Zero code, wrong meaning, and it breaks the uniqueness read.
- **Deleting the row.** Breaks the suite and every foreign key, and turns a quiet decision into a
  loud one.
- **Gating the route in `proxy.ts`.** Keeps the decision out of the page, but the middleware cannot
  answer `notFound()` cleanly, needs its own short-TTL copy of the hidden set, and would let a hidden
  page stay reachable for up to that TTL — all to avoid a check the page already gets from the row.
