# The Syrian Pound market rate has two keyless sources

ADR-0012 made sp-today the publisher of record for the SYP market rate, and ADR-0013 stored
that value as the **Parallel Rate** beside the official one. In production it stopped landing:
sp-today sits behind Cloudflare, which challenges the serverless egress the sync runs on, so
every refresh came back with the official value and the market figure — and its
official/parallel toggle — silently disappeared for days. The scrape itself is healthy (it
answers from a residential IP in under a second), so the failure is the host's bot rules, not
our parser. A key is the vendor's supported path, but the constraint here is keyless, free and
self-serve, so a keyed API is out.

We decided the SYP market rate gets **two independent keyless sources** behind the existing
composite variant provider. sp-today stays primary; **Lira Scope** (`lirascope.syria-cloud.sy`)
is added second. Lira Scope serves the same Damascus street rate from plain **nginx with no
bot challenge**, which is exactly what a datacenter fetch needs. Both parse server-rendered
HTML, and the composite keeps the first value a source returns, so a challenged primary is
covered by the secondary instead of leaving a hole. Together with ADR-0014's last-known
fallback and the `staleParallels` health signal, one blocked host can no longer remove the
number from the page.

## Considered options

- **Request the sp-today API key.** Rejected: it is the stable interface, but it requires
  contacting the vendor, against the keyless/self-serve constraint.
- **Proxy the scrape through another network** (a Cloudflare Worker or a paid scraping API).
  Rejected as the first move: it adds an egress dependency we would have to run, where a
  second publisher is just another scraper behind the same seam.
- **Keep a single source and rely on degradation.** Rejected: that is precisely what failed —
  one Cloudflare rule removed the market rate for days.

## Consequences

The SYP market rate has two hosts to fail over between, but both are **unversioned pages**, so
drift remains possible and each source still reports its own failure to Sentry (registered
under `sp-today` and `lirascope`). Prices from the two sources may differ by a few piastres;
the composite takes the primary when it answers, so the displayed value is stable rather than
flickering. The page should name the market source it is showing. If Lira Scope is challenged
too, the next step is an egress relay, not a third scrape.
