# A profile is prerendered from the roster

`/u/[username]` has `revalidate = 300` and no `generateStaticParams`, so Next never drew one up: the
route table says `ƒ`, and `prerender-manifest.json` does not list it at all. Every profile visit is a
function invocation that renders the page and reads the member through `unstable_cache` — cheap per
visit, unbounded in aggregate, on a surface that `sitemap.ts` enumerates for crawlers and that the
community roster links to on every page. `revalidate = 300` was decoration: with no params to
prerender and no marker that the route is cacheable, nothing was cached.

## Decision

**The roster decides what the build draws, and everything else caches on first visit.**

1. **`generateStaticParams` returns the roster.** `loadCommunityMembers()` — the same 50 handles
   `/community` links to, newest first — becomes `{ username }[]`. Those pages are prerendered at
   build and revalidated every 5 minutes, so the pages a visitor actually arrives from are ready
   before the first request.
2. **The set is a cap, not "everyone".** Build time scales with the number of params. A member past
   the roster is worth one render on first visit, not a permanent build cost, so they are left to
   on-demand ISR.
3. **`dynamicParams` stays on, named.** A handle outside the prerendered set — a member who joined
   after the build, or one past the cap — renders on its first visit and is cached from then on. That
   is what turns the route from `ƒ` into real ISR rather than 50 hand-picked pages and a dynamic
   rest.
4. **The prerendered key is percent-encoded.** Handles may be Arabic; the key has to be the path the
   site's own links and `sitemap.ts` build (`encodeURIComponent`), which is the form a request
   carries. The page already accepts both forms (`decodeHandle`).
5. **Hidden members are out by construction.** The roster read filters `is_hidden` (ADR-0127), so a
   hidden row is never a prerender param and never appears in the profile set.

## Consequences

- The route table changes from `ƒ /u/[username]` to `● /u/[username] … 5m`, and
  `prerender-manifest.json` gains the entries — the evidence to check on any change to this page.
- A profile edit already revalidates the `community-member-by-username` tag
  (`backend/controllers/profile.ts`), so a rename refreshes the data behind both the old and the new
  handle; the old handle's HTML turns into a 404 when its own 5-minute window expires.
- The build now does one roster read and renders the roster's profiles. With thousands of members
  that is the roster cap (50), not thousands — on-demand ISR covers the tail.
- Publishing a post still invalidates the feed tags, not the profile pages; a member's post list
  inside their profile refreshes on the same 5-minute window as before.

## Alternatives considered

- **Prerender every handle.** The sitemap already enumerates them (up to 50,000), so the params exist.
  Rejected: it makes the build proportional to the directory, and the tail is by definition the part
  nobody is reading yet.
- **Leave the route dynamic.** What shipped before: correct, and every profile view pays a render
  forever. The measured route table is the reason this exists.
- **A rewrite or a proxy-cached HTML layer.** Rewrites a routing concern into a caching one and would
  still need the same "which handles" answer; `generateStaticParams` is the framework's own seam.
