# The loopback port is not part of the registration

Measured on production on 2026-11-13, an hour apart, with the client's own stored
credential as the record:

| What the client registered        | What its next re-authentication asked for | Answer                                                            |
| --------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `http://127.0.0.1:52151/callback` | `http://127.0.0.1:63881/callback`         | `invalid_request: redirect_uri is not registered for this client` |

The client was not wrong. `opencode mcp auth royaraqamia` re-used the registration
it already held — the flow had completed once, minted a token pair, and the second
run only needed consent again — and bound a fresh loopback callback, because that
is what a native client does: the port is picked at run time. RFC 8252 §7.3 leaves
no discretion here: for a loopback redirect URI the server "MUST allow any port to
be specified at the time of the request".

The server compared strings instead. `redirect_uris.includes(redirectUri)` in
`/mcp/authorize`, the consent page, the consent POST and the registration route —
four call sites, each written separately, each passing a unit test whose fixture
used one fixed port. That is why nothing failed until a second run.

## The decision

1. **A redirect URI is compared as a parsed value, in one module.**
   `backend/services/mcp/redirect-uri.ts` owns what may be registered and what a
   client may be redirected to. The endpoints call `isValidMcpRedirectUri`,
   `allowsRedirectUri` and `isSameRedirectUri`; none of them parses or compares a
   URI itself.

2. **A loopback registration accepts the port the client bound this run.** Scheme,
   host, path and query still have to match — the port is the only part RFC 8252
   takes out of the comparison. The hosts are not interchangeable: a registration
   for `localhost` does not authorise `127.0.0.1`, because the two can resolve
   differently on the user's machine.

3. **Everything else keeps the exact rule.** An https redirect matches in full,
   port included, so a registration of `https://client.example:8443/cb` still
   refuses `:443`. A path prefix is not a match; a fragment is refused outright
   (RFC 6749 §3.1.2).

4. **The token exchange keeps a stricter rule than the authorize step.** RFC 6749
   §4.1.3 requires the exchange's `redirect_uri` to be identical to the one the
   authorization request carried, so `isSameRedirectUri` compares the port too and
   only tolerates two spellings of one value. A client cannot present a different
   port at exchange time than the code was issued for. The code row stores the
   requested value, not the registered one, for the same reason.

5. **The registration policy does not change, but its documentation was stale.**
   ADR-0022 named `http://localhost*` as the development exception; the code has
   accepted `127.0.0.1` and `[::1]` all along, and RFC 8252 spells loopback as an
   IP literal. The policy now lives with the comparisons and says what it means.
   Registration stays open (ADR-0022's decision is untouched).

6. **A refusal is logged with both values.** The requested target and the
   registration it was held to, beside the client id: a report like the one above
   should be one log query, not an archaeology of a client's credential store.

7. **The pattern is gated, not the instances.** `npm run check:redirect-uri` fails
   `redirect_uris.includes(`, `.includes(redirectUri)` and any `redirect_uri`
   identity comparison outside the module. Four hand-written call sites were the
   defect's shape; a fifth is the normal way it returns.

8. **The registration's own lifetime is a separate change.** This fix removes the
   reason the clients table grew one row per run — a re-authenticating client now
   re-uses the registration it holds — so the churn stops where it was caused.
   Collecting registrations that were never used deletes rows, and that deserves
   its own measurement and sweep rather than riding on a correctness fix.

## The same flow, after the deploy

The two cases the report named — a first authentication, then "I already have
credentials, re-authenticate" — run against production once the fix was live, on
2026-11-13:

| Run                     | Client                                                      | Callback this run                 | Answer    |
| ----------------------- | ----------------------------------------------------------- | --------------------------------- | --------- |
| first, no credentials   | `WxXXPT8xUi2glLdvY7qD-w`, registered on `:54035`            | `http://127.0.0.1:54035/callback` | connected |
| second, re-authenticate | the same client — the registration was re-used, not renewed | `http://127.0.0.1:57346/callback` | connected |

One registration serves both launches, and the second run's port is nowhere in
it. That is the property the string comparison could not give: the port belongs
to the run, not to the client.

## Consequences

- **The trust boundary is the host, not the port.** A loopback registration now
  authorises any port on that host, which is the same authority the user's own
  machine already has: anything running locally can bind a port. PKCE (S256) is
  still mandatory, and the consent screen names the callback host it was shown.
- **A unit test with one fixed port proves nothing here.** The contract case is
  the measured pair above, and it lives in the module's table beside the route
  tests, so a future fixture cannot quietly go back to a single port.
- **The gate applies to the outbound client too.** `backend/clients/mcp-remote.ts`
  plays the other role — we are the client — and reading its `redirect_uri` is
  untouched; deciding with one is what the gate refuses, because there is one
  policy in this repository and both directions are answerable for it.
