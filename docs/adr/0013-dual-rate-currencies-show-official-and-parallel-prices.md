# Dual-rate currencies show official and parallel prices

For five currencies the **Official Rate** a central bank administers and the **Parallel
Rate** people actually trade at have moved apart structurally, not on a single bad day:
SYP ~122 vs ~138, IQD ~1310 vs ~1596, DZD ~133 vs ~240, LYD ~6.42 vs ~9.8, and YER ~236
against _two_ markets, Sanaa ~531 and Aden ~1571. Frankfurter, the reference feed
(ADR-0010), is a blend of roughly a hundred official/reference sources — it contains no
Bank of Algeria and no Central Bank of Libya, and it carries no parallel value at all —
so it cannot be presented as "the official price", nor can it supply the market one.
ADR-0012 already recognised the problem for SYP, but solved it by _replacing_ the
reference value with the market value, which shows a single number and hides the gap.

We decided to model **two rate variants per Currency** and show both. The **Official
Rate** is fetched from the country's central bank (or a labelled proxy) and the
**Parallel Rate** from a market source; the parallel value never overwrites the official
one. Each variant carries its own quote date, previous value and change, so the two feeds
age independently. On the public board the parallel rate leads — it is the price a visitor
came for — with the official rate shown beside it and the **spread** between them surfaced
as the page's signal. The converter gains a basis (رسمي / موازي) that defaults to the
parallel rate for these currencies. YER is not one official-versus-market pair but one
official rate against two note regimes, so its parallel variant carries a city (Sanaa /
Aden) rather than an average. Implemented in phases: SYP, IQD and DZD first, where both
sources are verified and keyless; LYD and YER once an acceptable source is chosen.

## Considered options

- **Keep the ADR-0012 behaviour — replace the reference with the market value.** Rejected:
  it discards the official rate and hides the gap, which is the whole reason these
  currencies are interesting.
- **Average the official and parallel rates into one number.** Rejected: the average is a
  price nobody trades at, and it launders a structural distortion into a plausible-looking
  value.
- **Treat Frankfurter as the official rate.** Rejected: it is a multi-source blend with no
  central bank for DZD or LYD, so calling it "official" is the same category error ADR-0012
  rejected for SYP.
- **A separate page for dual-rate currencies.** Rejected: it fragments one question
  ("what is the dollar worth?") across two surfaces and duplicates the feed.
- **Flip the existing SYP overlay to official + parallel.** Accepted for SYP specifically:
  the market scrape stays, the reference is no longer thrown away.

## Consequences

Rate Snapshot grows a parallel channel and a per-variant quote date; the `CurrencyQuote`
contract, the converter's `RateLookup`, and `getSeries` gain a basis dimension. Every
parallel feed is an unversioned third-party source (a scraped page or a community JSON
API), so each sits behind the provider seam and falls back to the reference value with a
Sentry alert, exactly as the SYP market provider does. Trust is the product (ADR-0011):
the page must always name the basis it is showing, never blend the two, and degrade to the
official value when the market feed fails. `CONTEXT.md` gains **Official Rate** and
**Parallel Rate** as distinct terms alongside **Reference Rate**.
