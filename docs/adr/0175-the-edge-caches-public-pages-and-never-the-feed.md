# The edge caches public pages, and never the feed

Measured on Cloudflare for the 24 hours to 2026-11-13, while the site was still paused for most of
the window:

|                         |                 |
| ----------------------- | --------------- |
| Requests                | 25.66k          |
| Uncached requests       | 24.22k (94.1%)  |
| Cache hit rate          | 5.86%           |
| Total transfer          | 205.6 MB        |
| Served from cache       | 7.05 MB         |
| **Reaching the origin** | **~198 MB/day** |

Render's free plan allows **5 GB of outbound bandwidth a month**, and a workspace without a payment
method is _suspended_ for the rest of the month when it runs out — not billed. 198 MB/day is 6 GB a
month against a 5 GB ceiling, and that is the floor: it is crawler traffic on a site with no readers.

The cause is not a misconfiguration, it is the default. Cloudflare caches by file extension, and a
Next.js App Router site answers with HTML, RSC payloads and JSON — none of which are cached unless a
Cache Rule says so. So almost every request reaches Render and is paid for in the allowance that
decides whether the site is up at all.

## The decision

1. **The feed says it is private, in the header rather than only in the renderer.**
   `app/community/page.tsx` has been `force-dynamic` since ADR-0173, but `next.config.js` still
   applied `public, s-maxage=300, stale-while-revalidate=1800` to `/community/:path*`, which matches
   `/community` itself. Verified live: the per-member page answered with that public header. It was
   invisible only because nothing cached HTML at the edge yet — the exact change this record makes.
   The rule is now `private, no-store` on `/community` exactly, and `/community/explore` and
   `/community/[slug]` keep the cache headers their own pages declare.
2. **Anonymous HTML may be cached at the edge; authenticated HTML may not.** The rule lives in the
   Cloudflare dashboard, because the cache is not in the repository, and it is written to bypass on
   the session cookie `@supabase/ssr` sets (`sb-<ref>-auth-token`, including its `.0`/`.1` chunks):
   `not http.cookie contains "-auth-token"`. A signed-in visitor always reaches the origin. Caching a
   response that carries a member's own rows is the failure this guards, and no TTL makes it safe.
3. **Only pages that already declare a lifetime are cacheable.** `/` (`s-maxage=3600`) and
   `/community/explore` (`revalidate = 300`) state what staleness their content tolerates. Nothing
   gains a cache lifetime from this decision that did not have one.
4. **The rates board gets an edge lifetime, and only at the edge.** `GET /api/rates/board` answered
   `max-age=0, must-revalidate`, so every poll from every client reached Render. It now sends
   `public, max-age=0, s-maxage=300, stale-while-revalidate=600`: pollers still revalidate, the edge
   may answer, and the board moves on a daily refresh.
5. **Build minutes are a budget too, and they were already overspent.** 500 minutes a month is about
   180 builds at this app's 2m45s, and the recorded cadence before the move was 291 production
   deploys in one month. `render.yaml` now ignores `docs/**`, `android/**`, `e2e/**`, `.github/**`
   and `**/*.md`, so a change that cannot reach the running app does not spend a build. `scripts/**`
   is deliberately not ignored — the build runs it.

## Consequences

- **"Cache Everything" remains forbidden.** It is the one setting that would undo point 2, and the
  bypass depends on every signed-in request carrying the session cookie, which is true today because
  the app authenticates with `@supabase/ssr` and rotates that cookie on the middleware hop.
- **A cache rule is configuration, not code.** A redeploy cannot prove it, a dashboard can; the rule
  text is recorded here so it can be re-entered after a settings export, a zone move or a rebuild by
  someone who was not in the room.
- **The 5 GB is still the ceiling.** These changes move the origin traffic by an order of magnitude at
  today's mix, but a site that grows past a few thousand real pageviews a month will still meet the
  limit, and the answer then is a paid instance, not more caching.
