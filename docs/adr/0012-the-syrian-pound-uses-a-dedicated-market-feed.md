# The Syrian Pound uses a dedicated market feed

ADR 0010 sources every fiat rate from **Frankfurter**, which republishes ECB reference rates.
For most currencies that is close enough to the traded rate, but the Syrian Pound is the
exception: Frankfurter quotes roughly **122** new SYP per USD while Syrians trade at roughly
**138**, and the two moved apart structurally, not on a single bad day. Showing the reference
number as "the price of the dollar" on a public page is worse than showing nothing.

We fetch the SYP **market** rate from **sp-today.com** and overlay it on the Frankfurter quotes,
leaving every other currency on the reference feed. A dedicated **SYP Market Provider** behind
the existing `FiatRateProvider` seam fetches the page, reads the USD row out of the Next.js RSC
flight payload, and converts the old-pound figure to the new (redenominated) pound at 100:1. A
plastic **SYP aware** wrapper swaps that value in for SYP and, on any failure, falls back to the
reference rate so a sync never dies because one secondary feed hiccuped.

## Considered options

- **Keep the Frankfurter reference rate.** Rejected: it is not the number anyone in Syria
  recognises, and the page presents it as a market price.
- **scrape liratoday.com / liratoday.net.** Rejected: the same brand is spread across hosts with
  different designs and no stable machine-readable shape; sp-today.com exposes the rates as a
  structured JSON array inside its server-rendered payload.
- **A keyed commercial vendor** (currencyapi.com, metals.dev). Rejected for the same reason as
  ADR 0010: a keyed vendor buys an SLA this page does not yet need.
- **Manual entry by an Admin.** Rejected in ADR 0010, and still rejected — the value moves
  intraday, and a hand-typed number on a trust-sensitive page invites silent error.

## Consequences

sp-today.com is an **unversioned third-party HTML page**, so the adapter parses the RSC flight
payload rather than a documented API. It can break without warning; the market read is therefore
best-effort and the reference value is the floor. Because a market rate moves intraday while the
free-plan rate cron runs at most daily, the board is also **refreshed on read** once it is older
than a few hours — the hourly cache bounds how often that refresh can fire. The **SYP Market
Provider** uses the Damascus "سوريا - عام" **buy** (شراء) price as the single quoted value, and
treats the 100:1 redenomination factor as a named constant so a future currency change is a
one-line edit. `CONTEXT.md` should keep **Reference Rate** and **Market Rate** distinct so code
and copy do not conflate them again.
