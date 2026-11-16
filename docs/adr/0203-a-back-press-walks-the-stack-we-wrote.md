# A back press walks the stack we wrote

`useBackAction` (`frontend/ui/navbar/use-back.ts`) asked `canGoBack()` and, when it said yes, called
`router.back()`. `canGoBack()` was derived from a trail of pathnames: a route equal to the one behind
it was read as a traversal, so the trail popped. A `Link` to that same route is not a traversal — it
is a push — but a pathname comparison cannot tell the two apart. Home → Community → Home (one tap of
the bottom bar away) pushed a third entry while the trail popped to one, so `router.back()` walked
browser entries in order: `A → B → A → B`, for as long as the member kept pressing. That is the
"two pages trade places" report.

## The decision

1. **The stack is written, not inferred.** `frontend/ui/navbar/nav-history.ts` holds the routes _we_
   pushed. It grows on a push we witnessed and shrinks on a traversal we witnessed; nothing else
   touches it. `canGoBack()` now means "the entry behind this page is one of ours", not "some route
   changed".

2. **Push and replace are witnessed where the browser writes them.** `NavHistoryTracker` wraps
   `history.pushState` / `replaceState` for the page load, so a `Link`, a `router.push` from a panel
   and a redirect all count the same way. `popstate` witnesses the traversal. A navigation nobody
   witnessed — an odd redirect, a dead click — replaces the top entry instead of growing the stack:
   under-claiming history falls _up_, over-claiming is what dropped visitors out of the site.

3. **Returning to the entry behind is a back, not a push.** One capture-phase click listener turns
   "go back to the page I came from" into `router.back()`, the way a tab bar behaves in every app
   people compare us to: Home → Community → Home collapses the pair instead of stacking a second
   copy of Home. Every other link is left to Next.

4. **Back never no-ops.** With no history and no parent above `pathname`, the control replaces with
   `/` rather than pressing into nothing. It still never pushes, so the stack strictly shrinks.

## Why not the alternatives

- **Keep the pathname trail, and only stop guessing pops.** It fixes the bookkeeping but not the
  content: `A → B → A` is still three entries, and back from the third still lands on `B`, which the
  member reads as a loop. The duplicate has to not exist.
- **A `backButton` listener or `App.exitApp()` at the root.** Rejected in
  [ADR-0082](0082-the-system-back-button-closes-the-app-at-the-root.md): a press that depends on the
  bridge does nothing on a launch where the bridge failed.
- **Replace the parent instead of popping at all.** Rejected: the browser's Android back then still
  walks the entries we left behind, so the loop survives on the hardware key.
- **A `navigation` API listener instead of wrapping the History API.** Chromium has it and the
  Android shell would be covered, but the same code runs on iOS Safari, where it does not exist. One
  path that works everywhere beats two that disagree.

## Consequences

- A duplicate destination is no longer pushed, so the entry behind a page is always a screen the
  member actually came from. Two presses of the same tab are one entry, not three.
- **A press in flight is not repeated.** The browser answers a traversal a frame or two later, and
  until it does the stack still describes the page being left; a second press in that window would
  pop the screen _after_ the one the member is about to see. Both paths (the floating control and
  the tab that returns to the entry behind) refuse it. A native app gets the same protection from
  its screen transition; a web document has to say so.
- `hasInAppNavigation()` still counts only pushes that changed the route, so the overlay guard entry
  of [ADR-0095](0095-an-open-overlay-owns-one-history-entry.md) (a `pushState` of the same URL, never
  a router navigation) leaves it at zero and a cold page still goes _up_.
- A navigation nobody witnessed is recorded as a replace: the back control falls up where it used to
  pop. That is the safe direction — the worst case is one extra `replace`, not an exit from the site.
- The wrappers are installed and restored by the tracker's effect, so a test that renders it (or a
  remount under React's strict mode) leaves the History API as it found it.
