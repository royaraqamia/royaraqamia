# The edge cache and the warm window

Measured on the live site on 2026-11-14, before the Cache Rules existed:

```text
/                    cf-cache-status: DYNAMIC
/community/explore   cf-cache-status: DYNAMIC
/_next/static/*.js   cf-cache-status: HIT
```

Cloudflare caches the hashed assets by default and nothing else. The public documents already carry
`s-maxage` (ADR-0175), so a Cache Rule is the only missing piece — without it every pageview is a
render on the 0.1-CPU Render origin.

The rules live in the dashboard, not in this repository. `npm run check:edge` is their regression
test, so a deleted or widened rule is a failing command rather than a slow site.

## The rules

Cloudflare dashboard → **Caching → Cache Rules → Create rule**. For each rule the settings are the
same: **Cache eligibility: Eligible for cache**, **Edge TTL: Respect origin TTL**, **Browser TTL:
Respect origin**. Do not enable "Cache Everything" over the zone: the member's feed is authenticated
HTML and is `private, no-store` for a reason (ADR-0176).

### 1. Public documents

Expression:

```text
(http.request.method eq "GET" and (http.request.uri.path eq "/" or http.request.uri.path in {"/terms" "/privacy" "/security" "/pricing" "/app-info" "/mcp/guide" "/community/explore" "/verify"} or starts_with(http.request.uri.path, "/community/") or (starts_with(http.request.uri.path, "/quran/") and not starts_with(http.request.uri.path, "/quran/api/")) or starts_with(http.request.uri.path, "/athkar/") or starts_with(http.request.uri.path, "/verify/")))
```

| Path                                                                     | What it is                                                     | Origin TTL  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------- |
| `/`                                                                      | the door, prerendered; every `?tab=` variant is the same shell | 1 h         |
| `/terms`, `/privacy`, `/security`, `/pricing`, `/app-info`, `/mcp/guide` | static documents                                               | 1 y / 5 min |
| `/community/explore`, `/community/<slug>`                                | the public hub and published posts (ISR)                       | 5 min       |
| `/quran/<surah>`, `/quran/tafsir/**`, `/quran/search/**`                 | static pages and vendored data                                 | 1 y         |
| `/athkar/evening`                                                        | static                                                         | 1 y         |
| `/verify`, `/verify/<code>`                                              | public certificates                                            | 1 y / 1 min |

Three boundaries are deliberate:

- `/community/` ends in a slash, so the member's feed (`/community`) is not matched.
- the `/quran/` branch excludes `/quran/api/`; everything else under it is public bytes.
- `/quran` and `/athkar` are not documents: they are 307s to `/?tab=/quran` and `/?tab=/athkar`, and
  the door they land on is the cached `/`. The verifier does not ask them to be `HIT`.

### 2. Optimized images

```text
(http.request.method eq "GET" and starts_with(http.request.uri.path, "/_next/image"))
```

Next's optimizer sets a one-day minimum TTL (`minimumCacheTTL` in `next.config.js`); a rule makes
Cloudflare the cache instead of the origin's `sharp` pipeline.

### 3. Versioned APKs

```text
(http.request.method eq "GET" and starts_with(http.request.uri.path, "/android/") and ends_with(http.request.uri.path, ".apk"))
```

The filename carries the version and the origin marks it `immutable`, so this is safe to keep at the
edge. It is the one large file the site serves (7.4 MB); without the rule a few hundred installs spend
the 5 GB outbound allowance the free plan suspends on.

### 4. Public API reads

```text
(http.request.method eq "GET" and (http.request.uri.path eq "/api/rates/board" or http.request.uri.path eq "/api/rates/series" or http.request.uri.path eq "/api/community/index" or http.request.uri.path eq "/api/athkar" or http.request.uri.path eq "/api/version" or http.request.uri.path eq "/api/consultation/packages" or http.request.uri.path eq "/api/training/cohorts" or starts_with(http.request.uri.path, "/api/u/")))
```

The same "respect origin, bypass if absent" setting makes the rule harmless for a path that forgets
its `s-maxage`: it simply is not cached. The reads above opt in explicitly:

| Path                                    | Who reads it                               | `s-maxage` |
| --------------------------------------- | ------------------------------------------ | ---------- |
| `/api/rates/board`, `/api/rates/series` | the rates tab and the app's converter      | 300        |
| `/api/community/index`                  | the public hub, cursor pages included      | 300        |
| `/api/training/cohorts`                 | the apply form                             | 300        |
| `/api/consultation/packages`            | the booking page                           | 60         |
| `/api/u/<handle>`                       | the app's profile screen (public row only) | 60         |
| `/api/athkar`, `/api/version`           | the shell, once per open tab               | 1 day / 60 |

`/api/news/board` is deliberately **not** in the list: its body is shaped by the reader's plan
(visitor one card, Free five, Pro fifty — ADR-0093), so it answers `no-store` and must keep doing so.
The profile page (`/u/**`) is also not here — it renders the viewer's follow state; only its API
sibling is public.

## What must never be cached

- `/community` — the member's feed (`force-dynamic`, `private, no-store`).
- `/notifications`, `/chats/**`, `/admin/**`, `/auth/**` — signed-in surfaces (`private, no-store`).
- `/u/**` — the profile renders the viewer's follow state into the HTML (`force-dynamic`).
- `/mcp` and `/mcp/*` — the MCP endpoint; tools and streams.
- `/api/**` — except the explicit reads in rule 4; every other route authenticates itself or answers
  `no-store` (the API cache-posture contract in `scripts/__tests__/api-cache-contract.test.ts` keeps
  that true).
- `/sw.js`, `sw-*.js`, `/manifest.json` — `no-store` / `no-cache` by design.
- `/android/latest.json` — the update manifest must be re-read on every visit.

`/account` is the exception that proves the rule: its document is a static shell
(`<AccountView />`) and the member's data arrives from `/api/me`, which is `private, no-store` and
never cached. Caching the shell is harmless, so it is not in the list above; the private read is.

A response that carries `Set-Cookie` is never cached by Cloudflare, and the public documents are
cookie-free on purpose (ADR-0176). That is the second line of defence, not a licence to widen a rule.

## The warm window

Render spins a Free web service down after **15 minutes** without inbound traffic and takes about a
minute to start. With 5–10 people online, the quiet gaps are real, so the first visitor after a gap
waits. `workers/warm/` is a Cloudflare Worker with a free Cron Trigger that requests
`/manifest.json` every five minutes through the active hours. It has no route: it cannot receive
web traffic, only wake the origin.

The 750 free instance-hours are shared with `downloader-host`, so the window is a budget:

| Window (Baghdad) | UTC         | Hours/day | Instance-hours/month | Left for `downloader-host` |
| ---------------- | ----------- | --------- | -------------------- | -------------------------- |
| 08:00–24:00      | 05:00–21:00 | 16        | ~480                 | ~270                       |
| 10:00–22:00      | 07:00–19:00 | 12        | ~360                 | ~390                       |
| 24/7             | 24/7        | 24        | ~720–744             | ~6–30 (too tight)          |

The config ships the 16-hour window. If `downloader-host` starts running long, shorten the cron in
`workers/warm/wrangler.jsonc` to the 12-hour one; the arithmetic is the table above.

```bash
cd workers/warm
npx wrangler@latest login   # once per machine
npx wrangler@latest deploy
```

Verify in **Workers & Pages → royaraqamia-warm → Triggers**, or with `npx wrangler tail`.

The Worker is a separate deployment from the site on purpose: it must keep running when a Render
deploy is in flight. It is not wired into CI, because deploying it needs a Workers-scoped Cloudflare
token that nothing else uses.

## The verifier

```bash
npm run check:edge                       # production
npm run check:edge -- --base https://…   # a preview
npm run check:edge -- --json             # machine-readable
```

It requests every public path twice (the first request is what fills the edge), requires the second
answer to be `HIT` or `REVALIDATED`, checks one real `/_next/static` chunk, one optimized image, the
public API reads, and the public API row of a profile discovered from the hub; then it asserts that
`/community`, `/notifications`, `/admin`, `/api/me`, `/api/notifications`, `/api/community/following`
and the profile page itself are **not** served from the edge — and that the feed and the profile still
say `private, no-store`.

It cannot prove the signed-in case: `/account` redirects and `/api/me` answers 401 when the script
has no cookie, and neither is cacheable anyway. The header assertion is the invariant that carries
it. For a real signed-in check, use the browser tool against the deployed site.

## Order of operations

1. Create the four rules above.
2. Run `npm run check:edge`. A first request after a deploy can be `MISS`; the script's second
   request is the answer.
3. Deploy the Worker and confirm a trigger fires.
4. After every deploy the purge empties the cache (ADR-0177); the first visitor refills it. If a
   public page looks stale, run `check:edge` to see whether the rule is still matching.
