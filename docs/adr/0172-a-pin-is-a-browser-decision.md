# A pin is a browser decision

The members rail on `/community` lists the roster `loadCommunityMembers()` returns: the fifty newest
verified members, one `unstable_cache` entry shared by every visitor, on a page that revalidates every
300 s (`app/community/page.tsx`). The viewer's own row is not necessarily in those fifty, and it is
never in a fixed position — the list is ordered by `created_at`.

A "your row first" rule decided on the server would have to know who is asking, which makes the page
per-visitor: the cache entry stops being shared, every request reads `users` again, and the surface
loses the ISR the whole community section is built on. The session already carries the answer in the
browser (`useSession()` → `/api/me`, the same source the account card reads, #946).

## The decision

1. **The pin is taken in the browser, from the session.** `withPinnedSelf`
   (`app/community/_components/member-pin.ts`) moves the viewer's row to the head; a guest gets the
   roster untouched, and the server output is unchanged.
2. **The pin is total, not a filter over the fifty.** The roster is a display cap, so a viewer the
   cap left out is drawn first from the session's own identity — same id, handle, name and avatar —
   rather than being absent from their own community page.
3. **One row, not two.** A viewer already listed moves; they are removed from their old position.
   The rest keep the newest-first order the repository returned.
4. **The marker is a label, not a second card.** «أنت» sits inside the name line, so the handle,
   the avatar ring and every other row's metrics are untouched. The rail is deliberately quiet chrome
   so the gradient avatars carry identity; a restyled card would be a second exception (a broken sort
   and a new visual language) for information one word already carries.
5. **The strip re-aims at its writing start once the pin lands.** The horizontal strip is laid out
   before the pin exists; measured on a signed-in load, it ended one chip past the start and left the
   pinned card off screen to the right. `scrollLeft = 0` is that start in `rtl`.

## Consequences

- **The roster's cache entry is untouched.** No per-viewer key, no extra read: the viewer's identity
  is already on the page, so the pin costs one client-side reorder of a list the page has drawn.
- **A signed-in load paints the roster, then pins.** The row moves after `/api/me` answers, which is
  the same first paint the account card has. The strip is corrected in the same effect, so the rect
  never settles with the pinned card out of view.
- **The native feed is unaffected.** `CommunityFeedScreen.kt` does not draw this rail, so there is
  no pair to port (ADR-0098).
- **A hidden profile still sees itself.** The test fixture account is `is_hidden`, so it is in no
  public listing, and it is exactly the case the total pin covers.

## Alternatives considered

- **Make `/community` dynamic for signed-in visitors.** The page would render per request and lose
  its cache for everyone; one row's position is not worth the feed's ISR.
- **Pass the viewer's handle down from the server.** There is no viewer at build or revalidation
  time; `proxy.ts` carries a country cookie, not an identity the page may key on.
- **Add a permanent «ملفي» row in the panel header instead of pinning.** It works for everyone at
  once, but it duplicates the account menu's door and answers "where is my profile" with a second
  place to look, not with the roster's own row.
- **Restyle the pinned card (tint, accent ring, larger avatar).** Rejected: two exceptions to one
  rule, and the ring is the shared member mark, not a state.
