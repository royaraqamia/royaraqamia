# The edge is purged when a deploy lands

Turning caching on (ADR-0175) made the site stop paying for crawlers, and handed it a new way to
serve the wrong page. Measured on the live origin on 2026-11-13:

```
/terms           Cache-Control: s-maxage=31536000
/privacy         Cache-Control: s-maxage=31536000
/consultation/book  Cache-Control: s-maxage=31536000
```

Next marks a prerendered page immutable for a year, which is correct: the bytes under that URL
cannot change between deploys. But they _do_ change **at** a deploy, and Cloudflare's rule is
"honour the origin's TTL". So a corrected terms page, a reworded privacy policy, a fixed form —
each would stay invisible to every visitor whose request hit the edge until somebody purged by
hand, which nobody does at 2 a.m.

The alternatives are worse than they look:

- **Ignore the origin's `Cache-Control` and use a short fixed TTL.** Cloudflare only caches what the
  origin marks cacheable _because_ the rule reads `Cache-Control`. A fixed TTL would also store the
  responses this site must never store — `/community` is `private, no-store` and was a cross-member
  leak until ADR-0176 made documents cookie-free. Trading that invariant for freshness is not a
  trade.
- **Shorten every page's `revalidate`.** It works, and it pays the origin a revalidation per page
  per window forever, for a freshness problem that occurs exactly once per deploy.
- **Content-hash the HTML.** Not possible for a document with a stable URL.

## The decision

**Purge the zone once per deploy, from CI, after the deploy is actually live.**

`.github/workflows/purge-cache.yml` runs on a push to `main` that the Render build filter would
build. It polls `sw-version.js` — which carries `<semver>-<7-char-sha>` and is served `no-store`, so
the poll cannot read a cached answer — until the running build names the commit just pushed. Only
then does it call `purge_cache` with `purge_everything`.

The wait is the whole point. A push is not a deploy; Render takes about three minutes to build and
swap, and purging on the push would refill the cache from the _old_ container, leaving the same
stale page with a fresh timestamp.

`purge_everything` rather than a URL list because the set of HTML a deploy can change is every page
it renders, and the site is small enough that a refill costs a handful of renders. The job also
purges when the deploy never answers, and fails loudly in that case: a failed deploy leaves the
previous build serving, and a purge of that is cheaper than a stale page.

## Consequences

- **A deploy now costs one extra run and one purge.** That is GitHub Actions minutes plus a brief
  origin refill, against a year of possible staleness.
- **A leaked or absent `CLOUDFLARE_API_TOKEN` fails the job** rather than silently skipping. A
  cache-purge token is the narrowest Cloudflare credential there is: it cannot read or change any
  setting, only empty the cache.
- **Render's deployments are not pruned, and nothing replaced that job.** `prune-deployments.yml`
  existed because Hobby charged Deployment Storage across _every_ retained deployment and never
  pruned; Render does not meter deployment storage and keeps deploys so a rollback is one click.
  Porting the prune would have been work protecting a limit that no longer exists, so the workflow,
  its script and its test were deleted with the migration.
- **`docs/vercel-usage.md` is history now.** Its measurements explain the move; its instructions no
  longer run.
