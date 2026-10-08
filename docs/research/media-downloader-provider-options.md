# Media downloader provider options

Fix for the production media-downloader: the Next.js app (Vercel) delegates extraction to a
self-hosted `yt-dlp`+`ffmpeg` Docker worker on Render free tier (`srv-db386u7lk1mc739om4h0`,
Frankfurt). YouTube returns **"Sign in to confirm you're not a bot"** to every yt-dlp client
(`visionos`, `tv`, `web_safari`, `web`) because Render's egress is a datacenter range.

**Question:** pick between (a) a managed downloader API behind the existing `MediaProvider`
port, (b) self-hosted yt-dlp + residential/mobile proxy, or (c) only Render/Vercel/Supabase.
The "cookies from a burner Google account" path is explicitly rejected.

All pages below were fetched on **2026-10-08**. The web-search provider is returning HTTP 403,
so this is built only from URLs fetched directly or via the Wayback Machine. `[verified]` means
the author read the value in that fetch this session. Wayback reads are marked with the snapshot
date because they can drift. Anything else is `[unverified]` or `[needs check]` — do not treat
prices as current.

## Summary

| Option                                                              | Returns media bytes?                     | Handles YouTube anti-bot?            | Egress type                  | Fits `MediaProvider`              | Verdict                         |
| ------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------ | ---------------------------- | --------------------------------- | ------------------------------- |
| (b) Self-host yt-dlp + residential proxy                            | yes (we already do)                      | likely, via trusted IP               | residential/mobile           | unchanged (`dispatch` + callback) | **recommended**                 |
| (a) Cobalt (self-hosted, own instance)                              | yes (tunnels file)                       | needs poToken server + proxy         | whatever host you give it    | synchronous `POST /` → tunnel URL | **viable**                      |
| (a) Managed unblocker API (Zyte / Bright Data / Oxylabs / Scrapfly) | mostly no (HTML/JSON; Zyte ≤100 MB file) | yes (their egress)                   | their residential/datacenter | sync HTTP fetch                   | partial — doesn't parse streams |
| (a) Apify actor (Docker)                                            | actor-dependent                          | only if actor adds residential proxy | Apify datacenter by default  | async run + dataset/webhook       | partial                         |
| (c) Render dedicated IPs                                            | n/a                                      | **no** — still Render ranges         | datacenter                   | n/a                               | **rejected**                    |
| (c) Vercel Functions                                                | **no**                                   | no                                   | Vercel/AWS datacenter        | n/a                               | **rejected**                    |
| (c) Supabase Edge Functions                                         | **no** (2 s CPU cap)                     | no                                   | Supabase edge                | n/a                               | **rejected**                    |

## Q1 — Managed downloader APIs

### Cobalt (imputnet) — open source, self-host

- **License: AGPL-3.0** `[verified]` (repo root LICENSE / about). This is a hard constraint for a
  closed product — self-hosting AGPL server-side generally triggers source-offer obligations, and
  the API README may add its own terms. Legal review required.
- "best way to save what you love" media downloader; monorepo with `api`, `web`, `packages`;
  Docker + docker-compose is the recommended deploy path `[verified]`.
- **Hosted `api.cobalt.tools` is not usable:** the docs say hosted instances "use bot protection
  and are **not** intended to be used in other projects without explicit permission"; you must
  host your own or ask an owner `[verified]`.
- **API shape maps cleanly to `MediaProvider`:** `POST /` with `Accept`/`Content-Type:
application/json` and a body containing `url` plus options (`videoQuality`, `audioFormat`,
  `downloadMode`, `youtubeVideoCodec`, `youtubeVideoContainer`, `youtubeHLS`, …). Response JSON
  has `status` of `tunnel` / `redirect` / `local-processing` / `picker` / `error`; the tunnel
  status returns a `url` + `filename` and `GET /tunnel` streams the file `[verified]`.
- **Auth model:** optional `Authorization: Api-Key <uuid>` and/or JWT `Bearer` (issued after a
  Turnstile challenge via `POST /session`); instance picks which to enable `[verified]`.
- **YouTube anti-bot:** cobalt has first-class YouTube knobs, including `CUSTOM_INNERTUBE_CLIENT`,
  `YOUTUBE_SESSION_SERVER` (an instance of `yt-session-generator` for `poToken`/`visitor_data`),
  `YOUTUBE_PLAYER_ID`, `YOUTUBE_ALLOW_BETTER_AUDIO` `[verified]`. It also reads an optional
  `cookies.json` for authenticated public content. **This does not by itself defeat an IP-reputation
  block** — a self-hosted instance on Render would hit the same "not a bot" wall unless it exits
  through a trusted IP.
- **Proxy support (key):** cobalt reads `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (undici
  `EnvHttpProxyAgent`) and can allocate random IPv6 addresses per download via `FREEBIND_CIDR`
  `[verified]`. So cobalt + a residential proxy is a legitimate option (b) variant.
- **Storage:** cobalt "never caches any content, it works like a fancy proxy" — files stream via
  the tunnel rather than being persisted `[verified]`. Aligns with ADR-0018 (no stored media).

### Apify (Store / Actor platform)

- Marketplace of 84,000+ Actors; an Actor takes JSON input, runs in Apify's cloud, returns
  structured data; billing is monthly plan + pay-as-you-go usage `[verified]`.
- **Pricing** `[verified]`: Free $0 ($5 usage), Starter $19 ($19), Scale $199 ($199), Business
  $999 ($999). Runs billed in Compute Units: **1 CU = 1 GB RAM × 1 h**, $0.2/CU on Free/Starter,
  $0.16 Scale, $0.13 Business. Proxies billed separately: residential **$8/GB** (Free/Starter) to
  **$7/GB** (Business); datacenter from $0.6/IP; Unblocker $1.5 → $1/1,000 requests; SERPs
  $2.5 → $1.7/1,000.
- **Downloader-specific:** the top-chart YouTube Actors are **metadata/transcript** scrapers
  (e.g. `streamers/youtube-scraper`, `apidojo/youtube-scraper`), not confirmed media-byte
  downloaders `[verified — descriptions read, not pricing/granular capability]`. Apify supports
  Docker-based Actors, so we could package yt-dlp ourselves, but a self-authored Actor still runs
  on Apify datacenter IPs unless it opts into the residential proxy add-on (`--proxy`).
- **Fit:** async — start a run, read the dataset or receive a webhook. Callback model suits
  `MediaProvider.dispatch`, but durable delivery of large media through Apify datasets is awkward
  and the egress-reputation problem is only solved by paying for residential proxy on top.

### Unblocker / scraping APIs (Bright Data, Oxylabs, Scrapfly, Zyte)

These solve **ban handling**, not media extraction: they fetch an HTML/JSON page (or render a
browser) through managed trusted IPs. None of them downloads YouTube's adaptive media streams for
you, so they would only help by (i) proving the page loads, or (ii) proxying a _direct_ media URL
you already resolved.

| Provider                     | What it returns                                                                                                         | Auth                                                           | Anti-bot / YouTube                                 | Price model `[verified unless noted]`                                                                                                          | MediaProvider fit                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Bright Data Web Unlocker** | web content/HTML, CAPTCHA solving, fingerprint emulation                                                                | API (Web Unlocker needs no KYC per FAQ; residential/mobile do) | its own unblocking infra                           | Free 5K req/mo; PAYG **$1.5/1K req**; Scale $499/mo = 383K incl., $1.3/1K extra `[verified via Wayback 2026-09-29]`                            | sync HTTP; returns page not file                    |
| **Bright Data Residential**  | proxy egress (bytes)                                                                                                    | username/password, SOCKS5 via Proxy Manager; KYC required      | can unblock sophisticated sites                    | PAYG **$4/GB** (50% off list $8), 141 GB $499/mo @ $4/GB … 798 GB $1,999/mo; 400M+ IPs; free geo-targeting `[verified via Wayback 2026-09-24]` | drop into yt-dlp `--proxy`                          |
| **Oxylabs Web Scraper API**  | structured data / raw HTML                                                                                              | API creds                                                      | managed proxies + rotation                         | from **$0.25/1K results**; free 2K-result trial `[verified via Wayback 2026-09-30 nav]`                                                        | sync HTTP; not file                                 |
| **Oxylabs Web Unblocker**    | unblocked HTML                                                                                                          | API creds                                                      | AI proxy unblocking                                | promo **$3/GB** (list $5/GB) `[verified via Wayback 2026-09-30 nav]`                                                                           | sync HTTP; not file                                 |
| **Oxylabs Residential**      | proxy egress                                                                                                            | username/password                                              | —                                                  | from **$2.5/GB**, 175M+ IPs `[verified via Wayback 2026-09-30 nav]`                                                                            | yt-dlp `--proxy`                                    |
| **Scrapfly**                 | Web Scraping API, Cloud Browser, Screenshot, Extraction, Crawler                                                        | API key                                                        | anti-bot + residential pools                       | Free 1K credits; Discovery $30/200K; Pro $100/1M; Startup $250/2.5M; Enterprise $500/5.5M `[verified]`                                         | sync API; **no media-download product**             |
| **Zyte API**                 | HTTP response body / browser render; **"Large downloads: download files up to 100 MB with automatic retry and resume"** | API key                                                        | automatic CAPTCHA + residential/dc/mobile rotation | HTTP $0.13–$1.27/1K; browser $1.01–$16.08/1K; volume tiers to $0.06/1K `[verified]`                                                            | closest to "fetch bytes", but via a direct URL only |

**Read:** for a managed-API route, **Zyte** is the only one that advertises a file/download
capability (≤100 MB) alongside anti-bot — but it still expects a URL to fetch, not a YouTube
googlevideo stream selector. **Bright Data Web Unlocker** and **Oxylabs Web Unblocker** return
HTML. None replaces yt-dlp's format selection + ffmpeg muxing unless the provider's egress is used
only as a **proxy** for our own yt-dlp.

### IPRoyal "Video Scraper API" (notable)

- Purpose-built YouTube video-download API: "search and select video IDs", "get the video files",
  structured output, bulk downloads, "save videos directly to your cloud" `[verified]`.
- **However it is not generally available:** the page shows "Request Access" and "Want Early
  Access? Join the waitlist" — i.e. waitlist/early access `[verified]`. Pricing not published
  `[unverified]`. Worth a waitlist signup as a future option. Live streams unsupported `[verified]`.

## Q2 — Residential / mobile proxy providers (for option b)

yt-dlp consumes `--proxy http://user:pass@host:port` (HTTP/HTTPS) and `socks5://…`; all providers
below advertise HTTP(S) and SOCKS5. Prices are per GB of proxied traffic, which matters because a
video download counts the full media size twice-ish (fetch stream + upload to client).

| Provider                    | Pool / claims                        | Protocol                         | Geotargeting                       | Price `[verified unless noted]`                                                           | Notes                                                                                                                                    |
| --------------------------- | ------------------------------------ | -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Decodo** (ex-Smartproxy)  | 115M+ IPs, 195+ locs, 99.92% success | HTTP(S) + SOCKS5                 | country/state/city/ZIP/ASN         | $3.75/GB (3 GB) → $2.75/GB (100 GB); PAYG **$4/GB**; Enterprise $2.50→$2/GB `[verified]`  | 3-day/100 MB trial; 14-day money-back                                                                                                    |
| **IPRoyal**                 | 64M+ IPs, 195 countries              | HTTP(S) + SOCKS5                 | country/state/city                 | **$7/GB** (1 GB) → $5.25/GB (10 GB) → $1.75/GB at 10 TB; PAYG $7.35/GB `[verified]`       | pay-as-you-go, never-expiring traffic                                                                                                    |
| **Webshare**                | 80M+ IPs, 195 countries              | HTTP + SOCKS5                    | country/city/state/ZIP/ASN         | **$3.50/GB** (1 GB) → $1.40/GB (3000 GB) `[verified]`                                     | ⚠️ "some websites are restricted on our Residential Proxy network … can be unblocked after a brief KYC" — YouTube status `[needs check]` |
| **SOAX**                    | 155M+ IPs, 195+ geos, 99.95% success | HTTP(S) + SOCKS5 + UDP/QUIC      | region/city/ASN                    | pricing page not fetched → `[unverified]`; trial **$1.99 / 3 days / 400 MB** `[verified]` | —                                                                                                                                        |
| **Bright Data Residential** | 400M+ IPs                            | HTTP(S) + SOCKS5 (Proxy Manager) | country/state/city/ZIP + ASN, free | **$4/GB** PAYG; volume to ~$2.5/GB `[verified via Wayback 2026-09-24]`                    | **KYC required** before residential use `[verified]`                                                                                     |
| **Oxylabs Residential**     | 175M+ IPs                            | HTTP(S) + SOCKS5                 | country/city/ASN                   | from **$2.5/GB** `[verified via Wayback 2026-09-30]`                                      | —                                                                                                                                        |

**Mobile proxies** (not individually priced here) are the strongest anti-bot IP class but cost far
more per GB — treat as an escalation path if residential still trips the bot check. `[unverified]`
for all specific mobile prices; not fetched.

**Important caveat:** none of these pages makes an explicit, verifiable promise that YouTube's
"not a bot" challenge is defeated. "Success rate" figures are vendor self-reported. This is the
single biggest unknown for option (b) and should be smoke-tested before committing budget.

## Q3 — Render / Vercel / Supabase capability study

### Render

| Capability                      | Finding                                                                                                                                                                                                                                                                                                                     | Source                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Run yt-dlp + ffmpeg in Docker   | **Yes** — Docker builds from a Dockerfile or a registry image; we already do this                                                                                                                                                                                                                                           | `[verified]` render.com/docs/docker               |
| Trusted / non-datacenter egress | **No.** Outbound IP ranges are _shared across all services in the region_; dedicated IPs are optional and auto-assigned. The dedicated-IPs FAQ explicitly says an IP set "can include addresses from one of Render's default outbound IP ranges" — i.e. still Render datacenter space. No residential/mobile egress exists. | `[verified]` outbound-ip-addresses, dedicated-ips |
| Dedicated IPs cost/plan         | Require **Pro workspace** or higher + a **per-IP-set monthly fee**; 3 IPv4 per set; up to 4 sets; can't choose the addresses; Frankfurt supported                                                                                                                                                                           | `[verified]` dedicated-ips                        |
| Free-tier sleep                 | Free web service **spins down after 15 min** with no inbound traffic; ~1 min cold start; 750 free instance-hours/mo; ephemeral FS; no persistent disks, no one-off jobs, can't receive private-network traffic; SMTP ports 25/465/587 blocked; Render may suspend on "uncommonly high volume" of outbound traffic           | `[verified]` render.com/docs/free                 |
| Regions                         | Oregon, Ohio, Virginia, **Frankfurt**, Singapore                                                                                                                                                                                                                                                                            | `[verified]` render.com/docs/regions              |
| Workers / cron                  | Background workers (queue consumers) and cron jobs (cron expression, UTC) exist; cron run hard-stopped at **12 h**; single-run guarantee; min $1/mo per cron job                                                                                                                                                            | `[verified]` background-workers, cronjobs         |

**Conclusion:** Render runs the extraction (i), cannot provide trusted egress (ii), can persist
output only on paid plans with a disk (iii) — but ADR-0018 says we store no media. Render's
dedicated IPs do **not** solve the YouTube block.

### Vercel

- **All fetched Vercel doc URLs returned 404** (`/docs/functions`, `/docs/functions/limitations`,
  `/docs/functions/configuring-functions/duration`, `/docs/functions/runtimes`, `/docs/fluid-compute`,
  `/docs/security/secure-compute`) — the fetcher is blocked from `vercel.com/docs`. Re-attempted
  direct and via Wayback on 2026-10-08: direct is still 404, and the Wayback captures
  (`/web/20261006073344/…/functions/limitations`, `/web/20260902180929/…/duration`) return only the
  JS shell, not the article. So this section is **`[unverified]` / `[needs check]`** — no primary
  Vercel source could be read this session.

Expected conclusion (to confirm from the deploy environment): Vercel Functions/Edge run
Node/Edge/Deno-style runtimes with **no arbitrary OS binaries** (no `yt-dlp`, no `ffmpeg`),
bounded max duration, bounded response size, and **no option to obtain a residential/trusted
egress** (Vercel runs on AWS datacenter IPs). Therefore: cannot run the extraction, cannot provide
trusted egress, cannot practically store the output. **`[unverified]`.**

### Supabase

- **Edge Functions limits** `[verified]`: max memory 256 MB; max wall-clock duration 150 s (Free) /
  400 s (Paid); **max CPU time 2 s per request** (excludes async I/O); request idle timeout 150 s;
  max function size 20 MB (CLI) / 5 MB (server-side); **Node libs requiring multithreading
  unsupported (e.g. `libvips`, `sharp`)**; no Web Worker / `node:vm`; static files can't be
  deployed via API (build with Docker); outbound ports 25/587 blocked.
- Runtime is the Deno-compatible Edge Runtime; heavy long-running jobs (read: media transcoding)
  are explicitly told to move to background workers `[verified]`.
- **No custom egress / no IP control** is offered for Edge Functions `[verified]`.
- **Storage** (S3-style object storage with signed, expirable URLs) _could_ hold a produced file
  in principle `[verified — Storage is the project's object store]`, but ADR-0018 says the
  downloader stores no media — so using Storage as a sink is an ADR change, not a drop-in.

**Conclusion:** Supabase cannot run the extraction (i — 2 s CPU, no arbitrary binaries), cannot
provide trusted egress (ii), and could only hold output (iii) by contradicting ADR-0018.

## Empirical platform matrix (2026-10-08) `[verified]`

Method: each URL was first confirmed extractable from a **residential** IP with
`yt-dlp --skip-download`, then dispatched to the **live Render host** (datacenter IP, no proxy, no
cookies) with `maxDurationSeconds=1`. A `duration` result means the probe succeeded (the reporter
then refused the over-long clip before downloading); `probe/blocked` means the platform refused the
datacenter IP. URLs came from yt-dlp's own extractor test fixtures.

| Platform    | Residential probe | Render (datacenter) result              | Verdict for the free path              |
| ----------- | ----------------- | --------------------------------------- | -------------------------------------- |
| YouTube     | ok                | `probe kind=blocked` ("not a bot")      | **blocked** (needs proxy/cookies)      |
| Rumble      | ok                | `probe kind=blocked` (HTTP 403)         | **blocked** (needs proxy)              |
| Dailymotion | ok                | `probe kind=generic` (no impersonation) | **fixable free** — install `curl_cffi` |
| Imgur       | ok                | probe ok, `output-missing`              | reachable; download needs a look       |
| SoundCloud  | ok                | `kind=duration` (probe ok)              | **works**                              |
| Reddit      | ok                | `kind=duration` (probe ok)              | **works**                              |
| Twitch      | ok                | `kind=duration` (probe ok)              | **works**                              |
| Bandcamp    | ok                | `kind=duration` (probe ok)              | **works**                              |
| Bilibili    | ok                | `kind=duration` (probe ok)              | **works**                              |

A second pass tested the **social** platforms on 2026-10-08 with current fixtures, since the first
pass had no valid URLs for them. Correcting an earlier overstatement: these are **not** uniformly
"login-walled"; it depends on the item.

| Platform          | Content            | Residential probe | Render (datacenter) end-to-end                 | Verdict                               |
| ----------------- | ------------------ | ----------------- | ---------------------------------------------- | ------------------------------------- |
| Instagram         | public reel / post | ok                | **`stage=ready`** (1.9 MB, 39 KB)              | **works anonymously**                 |
| LinkedIn          | public post video  | ok                | **`stage=ready`** (8.6 MB, 5.6 MB)             | **works anonymously**                 |
| X (Twitter)       | public post video  | ok                | **`stage=ready`** (0.7 MB, 19 MB)              | **works anonymously**                 |
| Facebook          | public video/reel  | ok                | **`stage=ready`** (0.35 MB, 23.5 MB, 1.5 MB)   | **works anonymously**                 |
| LinkedIn Learning | course video       | needs login       | —                                              | auth-walled (separate limitation)     |
| TikTok            | public video       | `451` (geo)       | `generic` ("Unexpected response from webpage") | **broken in yt-dlp** — IP-independent |

Nine jobs (Instagram ×2, LinkedIn ×2, X ×2, Facebook ×3) were dispatched to the live host with
realistic caps (360p, ≤25 MB, ≤600 s) and **all nine returned `stage=ready`** — a real file was
written and served. So **public content on Instagram, LinkedIn, X and Facebook downloads fully from
the datacenter IP with no proxy and no cookies.** (An earlier pass misread `output-missing` from a
1 MB cap as failure; these ready results supersede that.)

Also inconclusive (dead/403 fixtures from the residential IP too): Vimeo, Streamable, Mixcloud.

**So the priority platforms are not lost:** public Instagram, LinkedIn, X and Facebook all download
anonymously even from the datacenter; TikTok is currently broken at the yt-dlp level (track upstream);
only **private/login-walled items** require cookies/auth on any IP.

**Two consequences:**

1. The datacenter block is **not YouTube-only** (Rumble too), but it is **not universal** — at least
   five major platforms extract fine from Render with no proxy and no cookies.
2. Dailymotion's failure is a **missing dependency, not an IP block**: yt-dlp wants an impersonation
   target (`curl_cffi`) that the image lacks. Installing `curl_cffi` is free and may also improve
   TLS-fingerprint handling elsewhere.

## Mapping to the `MediaProvider` port

- **Option (b) proxy:** no port change. Keep the existing worker; add a `MEDIA_PROXY_URL` next to
  the provider config and pass it to yt-dlp `--proxy` (and/or cobalt `HTTP_PROXY`). The circuit
  breaker (ADR-0020) should key on proxy-vs-direct so a dead proxy degrades gracefully.
- **Cobalt (self-hosted):** implement a new `MediaProvider` adapter — `dispatch(url)` calls
  `POST /` with an `Api-Key`, maps `status` (`tunnel`/`redirect`/`picker`/`error`) onto our
  result shape, and treats the returned tunnel URL as the short-lived download link. Synchronous
  request, no callback bus needed.
- **Zyte / Bright Data / Oxylabs:** a thin sync adapter that fetches a URL; only useful as the
  _proxy_ leg or to verify page accessibility, not as a full extractor.
- **Apify:** `dispatch` starts a run; a webhook/dataset poll delivers the result. More moving parts
  than cobalt for the same outcome.

## Recommendation

1. **(b) Self-hosted worker + residential proxy (recommended).** Smallest architectural change:
   keep the existing `MediaProvider` and Docker worker, add a paid residential proxy and test
   YouTube. Cheapest tested entry: **Decodo / IPRoyal / Webshare at ~$3.50–$5/GB**, with
   **SOAX $1.99 / 400 MB** and **Decodo 100 MB** free-ish trials for the spike. Watch per-GB cost —
   video bytes flow twice.
2. **(a) Cobalt, self-hosted with the same proxy** (second choice). Better ergonomics (tunnel API,
   per-request quality options, built-in Turnstile/API-key auth, no local media storage) and it
   also accepts `HTTP_PROXY`. Blocker to clear first: **AGPL-3.0** licensing, and it still needs a
   trusted egress (so this is option (b) plus a nicer API surface, not a way to avoid the proxy).
3. **(a) Zyte API as a hybrid assist** (third choice). Buy the anti-bot + ≤100 MB download
   capability for the cases where we already hold a direct media URL, behind the same port; do not
   expect it to replace yt-dlp's stream selection.

**Do not** pursue: (c) Render/Vercel/Supabase as the egress — none offers trusted/residential
egress, and Vercel/Supabase cannot run the binaries at all. Render dedicated IPs are still Render
ranges and don't help.

## Open questions / `[needs check]`

- Does a given residential proxy actually pass YouTube's bot check? Vendor "success rate" is
  self-reported; **must be smoke-tested** with a real yt-dlp `--proxy` run before purchase. `[unverified]`
- Whether **Webshare** restricts YouTube on residential (page says some sites need KYC to unblock). `[needs check]`
- **SOAX** residential price per GB (page not fetched). `[unverified]`
- **IPRoyal Video Scraper API** GA date and price (waitlist only today). `[unverified]`
- All **Vercel** function limits (docs blocked). `[unverified]`
- Whether any Apify Store Actor genuinely returns downloadable media bytes (top Actors are
  metadata/transcript). `[needs check]`
- Legal/TOS review of AGPL for cobalt, and of each provider's acceptable-use policy for
  downloading media.

## Sources

Fetched 2026-10-08 (search provider down; direct fetch or Wayback):

- Cobalt repo — https://github.com/imputnet/cobalt
- Cobalt API docs — https://github.com/imputnet/cobalt/blob/main/docs/api.md
- Cobalt run-an-instance — https://github.com/imputnet/cobalt/blob/main/docs/run-an-instance.md
- Cobalt env vars — https://github.com/imputnet/cobalt/blob/main/docs/api-env-variables.md
- Cobalt web — https://cobalt.tools
- Apify Store — https://apify.com/store
- Apify pricing — https://apify.com/pricing
- Bright Data Web Unlocker pricing — https://brightdata.com/pricing/web-unlocker (via https://web.archive.org/web/20260929173911/https://brightdata.com/pricing/web-unlocker)
- Bright Data Web Unlocker product — https://brightdata.com/products/web-unlocker (403 direct)
- Bright Data residential pricing — https://brightdata.com/pricing/proxy-network/residential-proxies (via https://web.archive.org/web/20260924054801/https://brightdata.com/pricing/proxy-network/residential-proxies)
- Oxylabs Web Scraper API — https://oxylabs.io/products/scraper-api/web (via https://web.archive.org/web/20260930191231/https://oxylabs.io/products/scraper-api/web)
- Scrapfly docs — https://scrapfly.io/docs
- Scrapfly pricing — https://scrapfly.io/pricing
- Zyte docs — https://docs.zyte.com/
- Zyte pricing — https://www.zyte.com/pricing/
- Decodo residential — https://decodo.com/proxies/residential-proxies
- IPRoyal residential — https://iproyal.com/residential-proxies/
- IPRoyal Video Scraper API — https://iproyal.com/video-scraper-api/
- Webshare residential — https://www.webshare.io/residential-proxy
- SOAX residential — https://soax.com/residential-proxies
- Render outbound IPs — https://render.com/docs/outbound-ip-addresses
- Render dedicated IPs — https://render.com/docs/dedicated-ips
- Render Docker — https://render.com/docs/docker
- Render free tier — https://render.com/docs/free
- Render regions — https://render.com/docs/regions
- Render background workers — https://render.com/docs/background-workers
- Render cron jobs — https://render.com/docs/cronjobs
- Supabase Edge Function limits — https://supabase.com/docs/guides/functions/limits
- Supabase Edge Functions — https://supabase.com/docs/guides/functions
- Supabase Storage — https://supabase.com/docs/guides/storage (not fetched; referenced from project knowledge)
- Vercel docs — https://vercel.com/docs/functions/limitations, /duration, /fluid-compute, /security/secure-compute (all 404/blocked)

## Related ADRs

- ADR-0017 — downloader runs off Vercel
- ADR-0018 — downloader stores no media; links are short-lived
- ADR-0020 — platform allowlist / per-platform circuit breaker
