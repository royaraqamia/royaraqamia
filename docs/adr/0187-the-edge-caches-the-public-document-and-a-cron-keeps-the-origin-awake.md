# The edge caches the public document, and a cron keeps the origin awake

Measured on the live origin on 2026-11-14, the day after the Render migration and before the Cache
Rules existed:

```text
/                    cf-cache-status: DYNAMIC
/community/explore   cf-cache-status: DYNAMIC
/_next/static/*.js   cf-cache-status: HIT
```

ADR-0175 made the public documents cacheable — they carry `s-maxage` — and ADR-0177 purges them at a
deploy. Neither put a Cache Rule on the zone, and Cloudflare does not cache HTML by default. So the
only work the edge did was hashed assets, and every pageview reached the 0.1-CPU origin. That is the
first wall a marketing push would hit: a burst of ten page loads is ten renders queued behind each
other, not ten cache hits.

The second wall is the free plan's spin-down. Render stops a Free service after 15 minutes without
inbound traffic and takes about a minute to start it. With 5–10 people online, the site is idle for
most of the day, so the first visitor after every gap pays that minute.

## The decision

1. **Cache the public document at the edge.** Three Cache Rules, kept in `docs/edge-cache.md`:
   public documents (`/`, the static pages, `/community/explore`, `/community/<slug>`, the Quran and
   Athkar surfaces, `/verify`), optimized images (`/_next/image`), and the versioned APKs
   (`/android/*.apk`). Edge and browser TTL both respect the origin's `s-maxage`.
2. **Never widen it to the zone.** `/community` is the member's feed and is `private, no-store`;
   `/account`, `/admin`, `/chats`, `/auth`, `/u/**`, `/mcp` and `/api/**` authenticate themselves.
   "Cache Everything" is the one setting that would turn the feed into a cross-member leak
   (ADR-0176), so it is forbidden, not merely discouraged.
3. **Keep the origin warm through the active hours.** `workers/warm/` is a free Cloudflare Worker
   Cron Trigger that requests `/manifest.json` every five minutes from 05:00 to 20:55 UTC (08:00 to
   23:55 in Baghdad). Sixteen hours a day is ~480 of the 750 free instance-hours a month, leaving
   ~270 for `downloader-host`. A 12-hour window is the fallback if that service starts running long.
4. **Measure the rules.** `npm run check:edge` requests each public path twice and requires the
   second answer to be `HIT`/`REVALIDATED`; it also asserts the private paths are not cached and the
   feed keeps `private, no-store`. The rules are dashboard state, so this script is the regression
   test the repository can run.

## The alternatives, and why they are worse

- **No warm window.** Simplest, and the first visitor after every quiet period waits about a minute.
  For a product trying to convince its first users, that is the worst possible first impression.
- **Warm 24/7.** 720–744 hours leaves almost nothing for `downloader-host`, and one long download
  run suspends the whole workspace. The window is a budget, not a preference.
- **A GitHub Actions cron for the ping.** GitHub's schedule drifts 5–15 minutes and has a five-minute
  floor; a 15-minute spin-down timer is exactly the window that drift misses.
- **Cache Everything plus a cookie bypass.** It nearly works, and one path missing from the bypass is
  a cross-member leak. The explicit public list is longer to write and safe to reason about.
- **A paid plan.** The first paying user buys `0.5c-512mb` (ADR-0186's consequence); none of this
  changes that. The edge work makes the free instance survive until then.

## Consequences

- **A marketing burst is a CDN problem.** The door is a single prerendered document; the first
  request fills the edge and the rest are `HIT`.
- **The APK stops spending the origin's 5 GB.** One rule turns a 7.4 MB download served through
  Render into an edge hit.
- **The first visitor before 08:00 still waits.** The window is active hours, not 24/7.
- **The rules are not in the repository.** A deleted rule is invisible until `check:edge` runs; run it
  after any Cloudflare change and after a deploy that touches the public paths.
- **The warm window costs instance-hours, not money.** The meter is shared with `downloader-host`;
  the table in `docs/edge-cache.md` is what keeps that trade visible.
