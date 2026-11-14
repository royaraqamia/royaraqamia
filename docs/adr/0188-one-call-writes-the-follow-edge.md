# One call writes the follow edge

A follow press took 1.70 s on production (warm, Edge, 2026-11-13) and an unfollow
2.00 s, while the button sat disabled on «جاري المتابعة...». A direct `DELETE` to
the same route answered in 1.76 s and a direct `POST` on an edge that already
existed in 1.21 s. That last figure is the informative one: it skips the viewer
read and the notification, so it prices the hops themselves, not the work on
them. Six or seven sequential round trips at roughly a quarter second apiece is
the whole figure.

`FollowsService.follow` did resolve the handle, read the block, ask the limiter,
insert, read the viewer for the notification body, and read the counts — each
awaited before the next. Only one of those six needs an answer in JavaScript in
order to decide anything, and it is not any of the four database reads.

## The decision

1. **`public.follow_edge` is the write.** In one call it resolves the handle,
   refuses a hidden or unconfirmed row as `not_found`, answers `self` for the
   viewer's own profile, refuses a block in either direction, inserts the pair
   `on conflict do nothing` (so "did this call write the edge?" is one boolean),
   reads the follower's name only when it wrote, and returns the target's two
   numbers. One round trip replaces five.

2. **The rate limit stays in the service, before the call.** It decides whether a
   write may happen at all, so a refused caller must not have written anything;
   and Upstash is not reachable from Postgres, so it cannot move into the
   function. Putting it beside the call would have bought one hop with a
   correctness bug: the write would land and the answer would be 429. The price
   is that resolving the handle is now inside the guarded step, so a handle the
   directory will not name spends one of the thirty a minute. A member pressing
   a button never meets that; a script walking the roster is exactly who should.

3. **The function is `security definer`, and only the service role may execute
   it.** It acts as the `p_follower_id` it is handed, so a client role that could
   call it could follow on somebody else's behalf. `revoke all ... from public`
   is explicit because Postgres makes a new function executable by PUBLIC
   otherwise, and the route already runs on the admin client for the adjacent
   reason: it must see the hidden and unconfirmed rows in order to refuse them.

4. **The notification keeps both of its properties.** It is still unawaited, so a
   push outage cannot fail a follow, and it is still sent only by the call that
   wrote the row — a second follow of the same pair writes nothing and the
   function answers no viewer, which is how the service knows there is nobody to
   name without reading the viewer row at all.

5. **The reads keep their shape.** `follow_counts` still answers a profile
   header, `viewerState` still reads the aggregate, the block and the edge in
   parallel for a page that already holds the member row, and `standingOf` still
   resolves a handle for the app. None of them is on the write path, and none of
   them is slower for this.

## Consequences

- **The write path is three network calls**: the session (`auth.getUser()`, which
  the issue never priced), the limiter, and the function. The 1.21 s figure for a
  `POST` that already skipped two reads says the multi-read path was never going
  to meet 500 ms by reordering its awaits alone; the hops had to go, not just
  move.
- **The count is read inside the write's transaction, after it.** The header
  updates from this answer, as it did before, and the numbers are the same
  aggregate `follow_counts` computes.
- **The function is a new schema dependency of the route.** The merge applies the
  migration and the merge deploys the code, in that order more often than not but
  not by construction; a follow press inside the window between them answers the
  route's generic failure and leaves the graph untouched. A rollback drops the
  function and returns the code to its previous multi-read path in the same
  change.
- **This is the shape for the next write that reads before it writes.** Four
  independent questions, all asked of one database, one answer. It is not an
  argument for moving rules into SQL generally: the two rules that need
  something outside Postgres — the budget, and telling the follower — stayed
  where they were.
