# A pasted URL is resolved by adapters, after the reader leaves

The complaint was concrete: the source form asked for "an RSS or Atom URL", and the reader does not
know what that is. Worse, the form _proved_ it — the probe ran inside the request, so the wrong link
came back as `feed_not_a_feed` and the submission failed. The product asked the reader to know the
answer before it would accept the question.

## The decision

- **Submission never reads the target.** A row is written as `resolving` and answered with `202`. The
  only refusals left are about the record — a duplicate of the catalogue, a second open request — not
  about whether the link answers.
- **A worker resolves it.** `scripts/news/resolve-source-requests.mjs`, on an hourly GitHub Actions
  cron, turns each `resolving` row into one of two answers: `ready` with the feed the digest will
  fetch, or `needs_review` with the reason. The app stays read-only for this path, and a public form
  never fetches an arbitrary host.
- **Adapters, not a converter.** Four shapes, each with its own honest outcome:
  - a feed URL, or a page that advertises one (`<link rel="alternate">` then the well-known paths) →
    `ready`, kind `feed`;
  - a YouTube channel, handle or video → the channel id the page carries → the channel's own
    `feeds/videos.xml` → `ready`, kind `feed`, no API key and no quota;
  - a Telegram channel → its public `t.me/s/<name>` preview → `ready`, kind `telegram`, read by
    `parseTelegramPreview` into the same item shape;
  - Facebook, X and Instagram → `unsupported`, `needs_review`, never fetched. There is no free public
    read for them, and pretending otherwise would be a source that silently publishes nothing.
- **A person answers what the machine cannot.** An Admin sees the reason and pastes the feed the
  source actually publishes; the paste is probed (the old probe, kept for exactly this) before it is
  approved. The approval RPC refuses a decision without a feed.
- **Telegram is a source kind, not a URL trick.** `news_sources.kind` records how a source is read, so
  the fetch dispatches instead of assuming every source is XML.

## Why not the alternatives

- **Converting a page into a feed** (scraping article links) is the promise people imagine and the one
  that rots fastest: every redesign breaks it, silently, for every reader of that source. The honest
  ceiling is "we find the feed that exists", and the queue is where the rest goes.
- **A paid API for Facebook/X/Instagram** would make them work tomorrow and stop working whenever the
  plan, the app review or the token changes. Marking them `unsupported` is a decision a person can
  reverse per source by pasting the feed.
- **Resolving inside the request** is what the form did. It cannot work for a blocked host without a
  timeout long enough to feel broken, and on a Hobby plan it makes the public form the SSRF entry
  point synchronously.
- **A per-site scraper list** is the same adapter idea with a rule per domain, and the maintenance is
  the part nobody budgets for.

## Consequences

- **"100% reliable" is true only of the submission.** The resolution rate is honest and uneven: feeds
  and YouTube are near-certain, Telegram mostly works, Facebook/X/Instagram never do automatically.
  The UI says "we will check it", never "it will work".
- **One open request per reader stays.** The private per-user source and its plan quota (Free 1, Pro 10) are a separate change: today a resolved source still enters the shared catalogue through an
  Admin, and the personal digest keeps narrowing the shared candidates rather than fetching a private
  list. `news.sources` still caps how many sources a reader may _select_.
- **The resolver's guard is a mirror.** `scripts/news/resolve-source.mjs` cannot import
  `shared/network.ts` (the job installs no compiler), so its public-target check is compared case by
  case against the contract's in `scripts/__tests__/news-resolve-source.test.mjs`. A drift is a test
  failure rather than an SSRF.
- **Every hop is validated.** Redirects are followed manually, each target is resolved and checked, and
  the body is read through a byte-counting reader, because the worker holds the service role and the
  URL came from anyone.
