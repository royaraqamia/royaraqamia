# Exchange rates are snapshotted from keyless external feeds

The **Exchange Rate** page needs full ISO 4217 coverage and gold/silver prices, and there were
three ways to get them: an operator enters rates by hand, a keyed commercial vendor is paid for
them, or a free public feed is fetched. We fetch: fiat from **Frankfurter** (`api.frankfurter.dev`)
and metals from **Gold-API.com** (`api.gold-api.com`), both keyless and unmetered, and we persist
each fetch as a **Rate Snapshot** rather than calling the provider on every page view. Snapshots
give the page deltas and charts, make a past value reproducible, and keep the page fast and
provider-outage-proof. Both providers sit behind a provider interface, so swapping either — for a
keyed vendor with an SLA — is a new adapter, not a rewrite.

## Considered options

- **Manual entry by an Admin.** Rejected: a maintenance burden for values that move daily, and it
  invites silent human error on a trust-sensitive page.
- **A keyed commercial vendor** (Open Exchange Rates, currencyapi.com, metals.dev). Rejected for
  v1: free keyless feeds cover the requirement, and a keyed vendor buys an SLA the page does not
  yet need.
- **Live per-request fetch.** Rejected: slower, exposes the page to provider latency and outages,
  and leaves no history to chart.

## Consequences

The feed carries no SLA; a keyless free provider can change terms or disappear, which is why the
provider sits behind an interface. Frankfurter quotes on ECB business days, so a snapshot's
**provider quote date** is often older than its fetch time — the page must show the quote date,
not "today". Metals coverage is thin in fiat feeds, which is why metals use a dedicated source.
