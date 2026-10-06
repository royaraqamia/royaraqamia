# The Iraqi Dinar market rate gets a second keyless source

ADR-0013 stores a **Parallel Rate** beside the official one for a handful of currencies, and
ADR-0015 gave the SYP market rate a second keyless source after Cloudflare started challenging
its primary from the serverless egress. The Iraqi Dinar has the same shape of problem:
`iraqprices.com` (the primary, a free keyless JSON feed) is behind Cloudflare and stopped
answering from the deployment, so the board held a stale IQD market value — visible as
`staleParallels: ["IQD"]` in `/api/rates/health`.

We decided to give IQD the same treatment as SYP: a second keyless source behind the existing
composite variant provider. **IQWealth** (`iraqsm.com/fx`) serves the Baghdad street rate and
the Central Bank rate from **Vercel with no bot challenge**, which a datacenter fetch can read.
`iraqprices.com` stays primary; IQWealth fills in only when the primary is challenged or drifts.
The price is read from the page's own phrasing ("… `1,598` ديناراً في السوق الموازية و`1,310`
ديناراً رسمياً").

## Considered options

- **Keep a single IQD source and rely on the last-known fallback.** Rejected: it keeps the
  number on screen but frozen, which is exactly the state that surfaced this.
- **Proxy `iraqprices.com` through another network.** Rejected for the same reason as ADR-0015:
  a second publisher is a scraper behind the same seam, not new infrastructure to run.
- **Scrape the upstream Telegram channel** (`t.me/s/iqborsa`). Rejected: it quotes the bourse
  in thousands-per-100-dollars (`159.650`) and mixes in unrelated markets, so the mapping is
  more fragile than a page that states the two rates in one sentence.

## Consequences

IQD now fails over between two hosts, both unversioned pages, each reporting its own failure to
Sentry (`iraqprices`, `iraqsm`). The two quote slightly different prints of the same market
(±0.1%), and the composite takes the primary when it answers, so the displayed value is stable.
Together with ADR-0014's last-known fallback, a blocked Iraqi source no longer leaves a frozen
number on the page.
