# Absolute URLs come from configuration, and a request is not an origin

Measured on production on 2026-11-13, minutes apart:

| Probe                                     | Answer                                              |
| ----------------------------------------- | --------------------------------------------------- |
| `/.well-known/oauth-authorization-server` | `"issuer":"https://localhost:10000"`                |
| `POST /mcp` (no token)                    | `resource_metadata="https://localhost:10000/..."`   |
| `GET /zzzzzzzz` (no such short code)      | `location: https://localhost:10000/?tab=/linksnap…` |

Every absolute URL the server built pointed at the container's own loopback address. `opencode mcp auth
royaraqamia` was the first thing to say so: it read the discovery document, trusted the issuer, dialled
port 10000 on the laptop, and got `ECONNREFUSED`. A password-protected short link had the same defect
with a worse audience — a visitor's browser was being sent to `https://localhost:10000/unlock/<code>`.

## Why it happened

`next start` does not know its public address. `node_modules/next/dist/server/lib/router-utils/resolve-routes.js`
builds the request URL as:

```js
config.experimental.trustHostHeader
  ? `https://${req.headers.host || 'localhost'}${req.url}`
  : opts.port
    ? `${protocol}://${formatHostname(opts.hostname || 'localhost')}:${opts.port}${req.url}`
    : req.url;
```

With `trustHostHeader` off, `request.url` is `https://localhost:<PORT>` — port 10000 on Render
(ADR-0174). `new URL(request.url).origin` is therefore the internal address, in every route handler,
forever, while every unit test stays green: a `NextRequest` constructed in a test always carries the URL
the test chose.

Middleware was never affected: Next rewrites a same-origin middleware redirect to a relative
`Location` (verified — `/admin` answers `location: /auth/login?redirect=%2Fadmin`), which is why sign-in
kept working through the whole period this was broken.

## The decision

1. **One configured origin: `env.origin`.** `resolveOrigin()` reads `PUBLIC_ORIGIN` (runtime), then
   `NEXT_PUBLIC_SITE_URL` (the value the browser inlines at build), then `NEXT_PUBLIC_BASE_URL` (the
   pre-ADR spelling). Development falls back to `http://localhost:3000`.
2. **Production refuses to guess.** Unset in production throws on first read; a value that is not a bare
   `http(s)` origin — a path, a query, a missing scheme — throws too, because `PUBLIC_ORIGIN` is
   concatenated with `/mcp`, `/mcp/token` and `/api/downloader/callback` and `https://host/foo` would
   silently build `https://host/foo/mcp`. A `PUBLIC_ORIGIN` that disagrees with `NEXT_PUBLIC_SITE_URL`
   also throws: two spellings that name different hosts is a deployment whose links and whose pages
   disagree. The constant fallback this replaces is what let the wrong origin survive a host move — it
   never failed, it only pointed somewhere else.
3. **`env.siteUrl`, `env.baseUrl` and `env.appUrl` are gone**, and every caller reads `env.origin`. Three
   names for one value is how the linksnap redirect ended up on `APP_URL` (unset on Render), the CSRF
   guard on `NEXT_PUBLIC_BASE_URL` and the OAuth metadata on the request.
4. **The MCP documents take no request at all.** `buildAuthorizationServerMetadata()` and
   `buildProtectedResourceMetadata()` default to `env.origin`, and the two `/.well-known/` routes have no
   `NextRequest` parameter left to derive one from. This is also what RFC 8414 and RFC 9728 require: an
   issuer is a stable public identifier that tokens are minted for, not a value a request can vary.
5. **`trustHostHeader` is not the fix, and a forwarded header is not either.** Turning it on makes the
   `Host` header the security boundary — a spoofed `Host` rewrites the issuer and the audience of every
   token — it hardcodes `https`, and it is experimental. `x-forwarded-host` only moves the problem into a
   proxy chain that has to be trusted and validated hop by hop. This site has exactly one canonical
   origin; configuration is simpler and strictly safer than either.
6. **`npm run check:origin` refuses the pattern**, not the instances it was written against: it fails any
   `new URL(req.url).origin`, `.nextUrl.origin` or `Host` header read in `app/`, `backend/`, `shared/`,
   `frontend/` and `proxy.ts`. A further call site is the normal way this returns.
7. **The request is not a URL base either.** `new URL('/mcp/connect', req.url)` is the same defect in its
   other shape, and the first version of the gate missed it: the OAuth consent hop answered
   `https://localhost:10000/mcp/connect?...` in the browser, so a client could register and authorize and
   then be handed a URL its own machine would refuse. Route handlers never get Next's relative-Location
   rewrite — measured: `/auth/callback` emitted its absolute `localhost` Location, while the middleware's
   `/admin` redirect came out relative — so the gate now fails a request-based base in `app/` and
   deliberately not in `backend/middleware/` or `proxy.ts`, where Next does rewrite it. A query read
   (`new URL(req.url).searchParams`) is untouched by the rule.
8. **The deploy reads its own documents back.** `purge-cache.yml` already waits for the new build to
   answer; it now also asserts that the live discovery documents name the configured origin. Unit tests
   construct their own requests and cannot see this class of bug, so the assertion belongs where a real
   request is answered.

## Consequences

- **A new absolute URL has one route.** If it is not `env.origin`, it is a bug, and the gate says so
  before the pull request is green.
- **`PUBLIC_ORIGIN` is now part of every environment's contract** (`render.yaml`, `example.env` and the
  README table). A preview or a promoted image changes a variable, not a build.
- **The build needs `NEXT_PUBLIC_SITE_URL`.** It is already committed in `render.yaml`; the CI build job
  passes it explicitly, because a production build that reads the origin during prerendering must not
  fail for a reason the checkout could have supplied.
- **A second canonical host is a configuration question.** If `onrender.com` ever has to be served, its
  absolute URLs still name the configured origin, which is the intended behaviour for a canonical host.
- **Tests stay honest but blind to this.** They may build any request URL they like; none of them is
  consulted for an origin, which is the property being recorded.
