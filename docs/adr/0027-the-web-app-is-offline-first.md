# The web app is offline-first for everything logically possible

Our audience reaches the site over intermittent, metered connections, so a network round-trip
before anything renders is a usability defect, not a detail. We decided that **every feature that
can logically work without a network must** — the site opens to last-known data instantly, the
account tools accept writes with the radio off, and connectivity is treated as an optional,
asynchronous dependency. Only features whose value is inherently tied to a live server (Media
Downloader, rate refresh, MCP, Admin, sign-in) may require the network, and they must say so
plainly instead of failing.

The bar is a _native-app feel_: instant paint, optimistic writes, and "offline" as a normal state
rather than an error page. This applies to an ordinary browser tab **and** an installed PWA; we do
not gate offline writes behind installation.

## Considered Options

- **Resilient reads only (cache the shell, hard-fail on write).** Rejected: it fixes the crash page
  but not the actual complaint — a user logging a habit or expense on a dropped connection still
  loses the action.
- **Restrict and hard-fail offline (a clear "you are offline" screen).** Rejected: the current
  behaviour, and the thing we are replacing.
- **Gate deep offline on an installed PWA.** Rejected: it puts the best behaviour behind an install
  funnel most visitors never complete.

## Consequences

Every product is now judged against this bar. Server-only surfaces must render an explicit
"needs connection" state rather than a spinner or a thrown error. New features pay an offline cost
in design: if it cannot degrade, it needs a stated reason. The mechanism (Local Store, Outbox,
cache tiers) is fixed by ADR-0028 through ADR-0031.
