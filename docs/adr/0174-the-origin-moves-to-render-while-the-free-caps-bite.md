# The origin moves to Render while the free caps bite

On 2026-11-12 Vercel paused the deployment: `Paused since Nov 12, 2026 for Fluid Active CPU. Your
team exceeded the Hobby fair use limits. This pause ends on Dec 12, 2026.` The measured month was
5h 06m against a 4h allowance, with 235K invocations — about 78 ms of CPU each, which is what an
ordinary server-rendered page costs. This was the second pause in two months, and the first one
(2026-10-12) was answered by removing a self-inflicted cost: `GET /mcp` had held an SSE stream open
for 60 s per client, 2,779 times. That fix is in place and the cap was still reached, so what
remains is the steady price of rendering pages.

Four hours a month is not a budget a server-rendered site can live inside, and there is no budget to
raise it: the site has no revenue yet, so `Pro` ($20/month) is not available and the site is simply
down until the pause lifts.

## The alternatives, and what each one cost

- **Cloudflare Workers.** Free allows **10 ms of CPU per request** and 10 ms per cron trigger
  (measured against the limits page, last updated 2026-10-29). Cloudflare's own documentation puts
  server-side rendering at 10–20 ms, so the first real page render fails with error 1102 and every
  cron fails nightly. The paid plan ($5) has the CPU, but the adapter does not build on Windows at
  all — `opennextjs-cloudflare build` dies on `ENOENT .next\server\instrumentation.js.nft.json` while
  bundling the middleware, after warning that Node.js middleware support is "experimental … not
  officially maintained". `proxy.ts` is Node middleware in Next 16 and runs on nearly every request.
- **Netlify.** The free plan is 300 credits with a hard stop, and a **production deploy costs 15
  credits**. The recorded month carried 291 production deploys — 4,365 credits, fourteen times the
  whole allowance — before a visitor arrives. Bandwidth is 20 credits per GB.
- **Google Cloud Run.** The free tier is generous (2M requests, 180,000 vCPU-seconds) and would have
  been the first choice, but the account requires **prepayment** before the free trial applies, so
  it is not free at all.
- **Koyeb.** The free tier is gone; the cheapest plan is $29/month.
- **Render.** A free web service with no card required: 750 instance-hours, 500 build minutes, 2
  custom domains, and **5 GB of outbound bandwidth per month** before services are suspended for a
  workspace with no payment method.

## The decision

1. **Render, native Node, free instance.** `render.yaml` builds with `npm ci && npm run build` and
   starts with `npm start`, which is the same command Vercel's build already produced a working app
   for. A container is a long-lived Node process, so every dependency that made the Workers port a
   project — `sharp` for `next/image`, `web-push` on `node:https`, the `node:dns` SSRF guard in
   `backend/shared/egress.ts`, and the `readFileSync` of the specialist roster in
   `backend/services/chat/agency-skills.ts` — runs unchanged. Nothing in the application is ported.
2. **Native runtime, not Docker.** The roster is read from `process.cwd()/.opencode/skills/agency` at
   request time. A Node service is built inside the cloned repository, so the directory is present.
   An image would have to copy it by hand, and would fail by answering with fewer specialist skills
   rather than by erroring.
3. **Cloudflare sits in front of it.** The 5 GB is the binding limit and 4,374 pageviews at a typical
   page weight is 6–9 GB. The zone is already on Cloudflare, so proxying the record costs nothing and
   its default cache already covers what dominates the bytes — hashed JS and CSS, fonts, and images —
   so those never reach the origin. A Cache Rule is the lever if the default is not enough, and
   "Cache Everything" must never be added: the site serves authenticated HTML. Audio never counted:
   it is served from R2 at `audio.royaraqamia.com` (ADR-0062).
4. **The crons move to GitHub Actions.** `vercel.json`'s three entries are now
   `.github/workflows/scheduled-jobs.yml`. The routes are untouched and still authorise themselves
   from `Authorization: Bearer <CRON_SECRET>` — the same header Vercel Cron sent. The repository
   already runs scheduled work this way (`mcp-catalog-agent.yml`, `news-source-requests.yml`), and
   the 04:00 catalogue sync keeps its hour of headroom before the agent's 04:45 run.
5. **The service-worker headers move to `next.config.js`.** `/sw.js` and the three files it imports
   were declared in `vercel.json`, which is read by Vercel and by nobody else. A header has to be
   declared where the server that sends it reads it. They are removed from `vercel.json` in the same
   change, because two definitions of the same header produced conflicting `Cache-Control` values
   once already.
6. **Vercel keeps its configuration but loses its clocks.** `vercel.json` stays, so the deployment
   can be resumed without a revert, but it no longer owns the crons — running both would double every
   job. The Vercel pause lifts on 2026-12-12 either way.

## Consequences

- **A cold first visit costs about a minute.** A free instance spins down after 15 minutes without
  traffic and shows a loading page while it starts. With no users yet that is the trade for $0; it is
  the first thing to revisit when the site has traffic, and the first thing Cloudflare cache rules
  soften.
- **5 GB is a hard ceiling, not a bill.** With no payment method, exceeding it suspends the service
  for the rest of the month rather than charging for it — the same failure shape as the Vercel cap,
  which is why the Cloudflare cache rules are part of this decision and not a later optimisation.
- **750 instance-hours are shared with `downloader-host`.** Both are free services on this workspace
  and both spin down when idle, so the allowance is not the constraint the bandwidth is.
- **The agent workflows lose deploy inspection.** `issue-implementer.yml`, `issue-planner.yml` and
  `opencode.yml` grant a read-only Vercel CLI to read deployments and logs. That capability does not
  survive the move; `prune-deployments.yml` has nothing left to prune.
- **This is a stopgap, recorded as one.** The migration is reversible in an afternoon because no
  application code changed. What it buys is a site that answers requests while the product finds
  users; when it earns, the question becomes a paid plan on a platform that does not meter a page
  render into a monthly allowance.
