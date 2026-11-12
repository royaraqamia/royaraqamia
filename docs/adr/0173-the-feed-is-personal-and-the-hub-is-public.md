# The feed is personal, and the hub is public

`/community` was one `unstable_cache` document shared by every visitor: `loadCommunityIndex()` read
every published post, the roster read the fifty newest members, and the page revalidated every 300 s.
The feed now means "what the people I follow published" - empty until a member follows someone - so
its answer is about the caller. That is the one thing an ISR document cannot be: `unstable_cache` is
keyed on arguments, and "who is asking" is not an argument it has.

The obvious shortcut - keep `/community` cacheable and let only signed-in members see the personal
list - is the trap. One URL would then answer a member and a crawler with different pages, and
whichever copy the cache held would be wrong for the other caller.

## The decision

1. **`/community` is the member's own feed, rendered per request.** `force-dynamic`, `noindex`, and
   the read runs as the caller: `loadFollowingFeed` resolves the request's identity (cookie **or**
   bearer, so the app reads the same rows) and queries a `security_invoker` view, so RLS decides the
   rows rather than a viewer id passed in from outside. A guest gets the empty state, not an error.
2. **`/community/explore` is the public hub.** The old read, unchanged and still cached: every
   published post, the roster, ISR at 300 s, `canonical` to itself, and the sitemap's 0.9 entry. A
   guest's empty state links there, and the personal page links there always. Ranking moves in one
   hop; no bookmark breaks.
3. **Two feed endpoints, named for their intent.** `/api/community/index` stays the cached, public
   page (the hub, and the app's current read). `/api/community/following` is the per-viewer page and
   answers `no-store`. Neither route has to infer which feed it is being asked for.
4. **`following_feed` is the personal rows.** A view over `posts` joined to the caller's own follow
   edges, minus either side of a block, with `security_invoker` so it reads as the caller. Publication
   state, `community_visible`, tombstones, search and the keyset cursor stay in the repository: there
   is one definition of "published", not two.
5. **A follow is an edge; a block is one table for the site.** `public.follows` is
   `(follower, followee)` with the pair as the primary key. `chat_blocks` became `public.blocks`,
   because it was always a member-to-member block that chat happened to write first, and a second
   block list would drift. Blocking severs follows in both directions in a trigger, so every writer
   gets the rule rather than only the one that remembers it.
6. **Counts public, lists private.** `follow_counts` is an aggregate-only security-definer function,
   so a profile header can show two numbers without naming a follower; the lists are ordinary RLS
   reads scoped to the member they belong to, and only the owner's pages render them.
7. **The follow control is server truth from the first byte.** The profile is rendered for the viewer
   who asked, so the two numbers and the viewer's standing are in the document: no read after paint,
   no skeleton, nothing to settle. The controls only write, and a write's own answer updates the
   number beside it. Guests see the button and are sent to sign in; the member's own profile shows
   «أنت»; a blocked profile shows only «إلغاء الحظر».

## Consequences

- **Three empty feeds, three sentences.** A guest, a member who follows nobody, and a member whose
  follows have published nothing are different facts. The first two carry an action; the third does
  not pretend to.
- **No snapshot for the personal feed.** The offline snapshot store is public and one device can be
  signed in as more than one member, so the personal route reads and writes none. The hub keeps its
  snapshot.
- **Follow writes are rate-limited, not capped.** Thirty writes a minute per member, through the
  limiter the site already has. A total ceiling is a Twitter-scale artifact that either never binds
  on a fifty-member roster or binds on an enthusiastic member; a script walking the roster is the
  abuse this surface can actually meet.
- **A new follower is one notification and one push**, through the existing fail-safe producer. An
  unfollow is silent.
- **The app still reads the public page.** `CommunityFeedRepository` calls
  `/api/community/index` with no bearer, so the shipped app keeps showing the hub until its half of
  this lands. Nothing in the app breaks in the meantime; the per-viewer read is a parity change, not
  a fix.
- **The roster's control follows its page.** The member's own feed passes the states the server already
  read, so every row's button is correct in the first paint. The cached hub draws no control at all:
  a per-viewer button there would have to be fetched in the browser, which is the round trip - and
  the 35 KB it cost the public route - that this ordering exists to avoid. A row still opens the
  profile, where the button is one tap away and already correct.
- **The profile is the per-viewer page; the hub is the cached one.** `loadCommunityMember` still caches
  the member and their posts under their own tag, so a profile render costs one aggregate and one
  edge. The first attempt kept the profile static and fetched the state in the browser: two grey
  skeletons in the middle of the header, a read that waited on `/api/me`, and a layout that settled
  after paint. That is the cost this ordering refuses to pay - the same call ADR 0172 made for the
  pin, resolved the other way because a button cannot be reordered into place.
- **A follow revalidates nothing.** No cached document carries a count or a standing any more, so the
  write answers its own numbers and leaves the tags alone: one press no longer re-renders the roster
  and every profile for every visitor.
