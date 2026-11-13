# A document that sets a cookie is a document no one can cache

ADR-0175 put a Cloudflare Cache Rule in front of the site and it changed nothing: every HTML response
came back `cf-cache-status: BYPASS`. The rule was not the problem. Measured on 2026-11-13, requesting
`/` twice:

```
without cookies:  BYPASS, BYPASS, BYPASS   (Set-Cookie: rr-country, rar_visitor)
with both cookies: MISS, HIT, HIT          (Set-Cookie: —)
```

Cloudflare will not store a response that carries `Set-Cookie`, and `proxy.ts` stamped two of them on
every navigation: `rr-country`, so a contact form could default its country picker to the visitor's
IP country, and `rar_visitor`, so a counted action could be attributed per browser (ADR-0093). The
entry that would have made everything cacheable was never created — for any visitor, at any time.

The cost of that is not theoretical: ~198 MB a day reached the origin against a 5 GB monthly
allowance that suspends the workspace when it runs out (ADR-0174), and the traffic is crawlers on a
site with no readers.

## The decision

**Per-visitor state is written where it is read, and never on a document.**

1. **The visitor id is minted by the counted action.** `POST /api/downloader/jobs` and
   `POST /linksnap/api/shorten` are the only two routes that read it. Each now asks
   `visitorKeyFor()` for the key it will count against — the carried one, or a fresh one — and
   stamps it with `stampVisitorCookie()` when it minted it. The first action therefore already has
   the identity every later action presents, which is what the middleware used to provide; a `POST`
   is never cached, so the `Set-Cookie` is free there. `withVisitorCookie` is deleted, and with it
   the last reason a navigation needed a cookie it did not use.
2. **The country cookie is written only where a component reads it.** Its consumers are the contact
   forms (`CountryPhoneInput` → `useDefaultCountry`) under `/consultation`, `/request-project`,
   `/hire` and `/training`. `proxy.ts` writes it on those paths and nowhere else. The rates surfaces
   fall back to timezone and language, which `useDefaultCountry` already implements — the same
   fallback a visitor with geo data unavailable has always had.
3. **The rule stays as written.** Anonymous HTML is eligible, the origin's `Cache-Control` decides the
   lifetime, and `-auth-token` (the `sb-<ref>-auth-token` cookie `@supabase/ssr` sets) still bypasses
   for a signed-in visitor. Nothing about the edge changes; what changes is that there is finally
   something to store.

## Consequences

- **A document now varies only by URL.** Any future feature that wants to personalise a cacheable page
  has to answer this first: read the value from a request the client makes, or accept that the page
  is not cacheable. A cookie on the response is never the answer.
- **The country default on the rates surfaces is timezone-derived, not IP-derived.** For most
  visitors that is the same country; where it differs, a currency picker opens on a neighbour. The
  exact version would cost a request per visitor, which is a worse trade than the fallback the code
  already had.
- **`rar_visitor` is now minted at the moment it is used.** A visitor who clears cookies mid-session
  gets a new id at their next counted action rather than at their next page view — the same reset
  window as before, moved one event later.
- **No per-visitor cookie is left.** `rr-country` was the last one, and it is gone: the four form
  pages read the platform header and hand the value down (`backend/transport/geo.ts` →
  `GeoCountryProvider`), so a document varies only by URL. A cookie a person writes by hand is still
  honoured as an override, but nothing emits one.
