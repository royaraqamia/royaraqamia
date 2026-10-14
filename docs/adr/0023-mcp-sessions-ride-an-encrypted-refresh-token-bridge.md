# MCP sessions ride an encrypted Supabase refresh-token bridge

When a user consents, their Supabase refresh token is encrypted (AES-256-GCM under
`MCP_TOKEN_ENCRYPTION_KEY`, which lives outside the database) into `session_enc` on the
MCP auth-code/token rows. Every authenticated MCP request then drains that bridge to mint a
**user-scoped Supabase client**, so RLS is enforced natively by Postgres and never re-imulated
in TypeScript; rotated refresh tokens are persisted back so the session survives Supabase
rotation.

## Considered options

- **Store nothing; impersonate the user with a service-role client and manually apply the
  same RLS predicates in code.** Rejected: replaces Postgres-enforced isolation with a
  hand-maintained copy of it — exactly the failure mode this repo's RLS-first posture
  forbids, and it makes every future table's policies doubly owned.
- **Mint long-lived MCP-specific credentials independent of Supabase auth.** Rejected:
  creates a second identity system whose revocation story would have to replicate logout,
  password change, and admin bans.

## Consequences

The encryption key is the crown jewel: a database dump alone is useless, key + dump means an
attacker can mint real Supabase sessions for consenting users. Therefore the key never
touches `NEXT_PUBLIC_*` territory, and its rotation runbook plus threat boundary are
documented in `docs/security.md`. Blast radius is bounded by token revocation (RFC 7009
`/mcp/revoke`), the pg_cron sweeper deleting expired/revoked rows, and the fact that RLS
still limits whatever an attacker can _do_.

## Amendment (2026-10-13): the bridge session is minted, not borrowed

The decision above stands. Where the bridged session comes from has been corrected.

The mechanism above copied the browser's `session.refresh_token` into `session_enc` at
consent. That copy is not the bridge's to own: the browser keeps rotating its own token
(`SessionProvider` plus `updateSession`, see `backend/middleware/session.ts`), and Supabase
refuses a token its session has moved past. Every authenticated MCP call then answered 401 —
permanently, because `/mcp/token` kept refreshing the _MCP_ token successfully, so no client
ever learned it had to re-authorize. The runbook in `docs/security.md` promised clients would
re-run the browser flow "auto-triggered"; nothing triggered it.

Measured against production on 2026-10-13, because the first draft of this amendment guessed at
the mechanism and guessed wrong:

| probe                                            | result                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| five concurrent refreshes, one stored token      | all `200` with an identical rotated token — the fleet-wide race needs no single-flight cache |
| re-present a superseded token at 60 / 120 / 300s | `200`, family **not** revoked — supersession alone kills no session                          |
| refresh after the session was signed out         | `400 refresh_token_not_found`                                                                |

So the borrowed bridge did not die of reuse detection; it was only ever _refused_, and the
surviving browser session is the proof. What a copy can never do is survive the browser
rotating past it — which is exactly what minting removes.

Two changes:

- **Mint the bridge.** Consent now exchanges an admin-generated magic-link OTP for a second,
  independent Supabase session for the same user
  (`backend/services/mcp/bridge-session.ts`). Nothing else rotates it, so the bridge is never
  superseded. It is still a genuine Supabase session — RLS, `auth.uid()`, bans and deleted users
  all still apply — so this is _not_ the rejected "MCP-specific credentials" option: the identity
  stays Supabase's, only the copy stops being the browser's.
- **Retire dead grants.** When the bridge cannot be revived — the refresh token is
  definitively rejected, the ciphertext will not decrypt (key rotation, the intended kill
  switch), or the row carries no session — the data plane revokes the grant's access _and_
  refresh rows. The client's next refresh is then answered `invalid_grant`, which routes it to
  re-authorization instead of the silent retry that used to loop: the MCP SDK's whole 401
  recovery hangs off `authProvider.onUnauthorized`, and its `Server returned 401 after
re-authentication` failure is reachable only when a refresh _succeeded_ and the retry was
  rejected anyway. Transient failures (network, 429, 5xx, a rotated publishable key) revoke
  nothing. Retirements log a reason code so the rate is countable.

Kill switches that still work, unchanged: `revokeAllUserTokens`, RFC 7009 `/mcp/revoke`, the
sweeper, key rotation, and signing out of the site — `auth.signOut()` defaults to scope
`global`, so it revokes every session the user holds, bridge sessions included.

Revocation is also a shred. Revoking a row (`/mcp/revoke`, `revokeAllUserTokens`, retirement)
nulls its `session_enc` in the same update, so a disconnected grant leaves no replayable
credential in the table; rotation reads the ciphertext it carries forward _before_ revoking for
the same reason.

The Supabase session itself is deliberately _not_ revoked on top of that. In every retirement
path we have, GoTrue has already refused or invalidated the session
(`refresh_token_not_found`, `session_expired`, `user_banned`), or the ciphertext will not
decrypt and there is nothing left to revoke with. The case that would need it is a _live_
client-initiated revoke — and there, revoking means revoking whichever session the row holds,
which for pre-amendment rows is the user's **browser** session. That would sign them out of
the site, so it needs a recorded marker saying the session is this grant's own; that is its own
piece of work, not something to approximate here. (Landed as the 2026-10-14 amendment below.)

## Addendum (2026-10-14): the user-facing disconnect now exists

The account area lists a user's live Grants (`/account/connected-apps`) and disconnects one client
(`DELETE /api/me/mcp/connected-apps/{clientId}`) or every client
(`DELETE /api/me/mcp/connected-apps`), which is `revokeAllUserTokens`'s production caller at last.
Both paths go through the same shred described above, and drop the client's live authorization
codes with it: a code carries a bridge ciphertext and exchanges for a fresh token pair, so leaving
one behind would let a client mid-exchange mint a grant the revoke had already passed.

The deferred half is unchanged: neither revokes the Supabase session, for the reason in the
paragraph above — nothing yet records that a session is a grant's own, and for a pre-amendment
row revoking it would sign the user out of the site.

## Amendment (2026-10-14): a live revoke signs out the grant's own session

That last paragraph is superseded: the marker it was waiting on now exists, and a _live_ revoke
signs out the session the grant minted. "Revoking a grant releases Supabase access" is now true of
a client-initiated revoke, not only of the retirement paths GoTrue had already killed.

**A session says whether it is ours.** A bridge ciphertext now carries a marker inside its
plaintext (`mcp-bridge:1:`, `mcp-token-crypto`), written by the one place a session is minted —
consent — and read through `readBridgeSession`. A ciphertext without it is a pre-amendment row
holding a copy of the user's browser session, and is never revoked. The marker lives in the
ciphertext rather than in a new column because it then travels with the secret for free:
`refreshAccessToken` carries the ciphertext forward verbatim, and the data plane re-encrypts a
rotated token the way it read it, so a marked row stays marked and a borrowed row stays borrowed.
It also needs no migration, no backfill applied to rows whose provenance we would be guessing at,
and no timestamp heuristic — the ciphertext itself is the record, and it is authenticated by
AES-GCM, so it cannot be forged without the key.

**The three live revokes share one helper.** RFC 7009 `/mcp/revoke`, `revokeAllUserTokens` and
`revokeUserClient` all read the ciphertexts _before_ the shred that would take them away, revoke
their rows, and only then have each marked session refreshed into an access token and logged out
at `scope=local`. Order matters in both directions: the sign-outs run after the revocation so a
session that will not die can never fail a disconnect that has already succeeded
(`Promise.allSettled`), and each distinct refresh token is signed out once even though a grant's
access and refresh rows both name it.

Only a revoke that ends the grant signs anything out. `revokeToken` on a _refresh_ token is that
case; an _access_ token alone can still be replaced from the refresh row, so that grant — and its
session — must stay usable. Scope `local` is load-bearing: `global` would revoke the browser's
session, which is the harm this whole marker exists to avoid.

Retirement paths are untouched and still make no network call: they are the paths where GoTrue has
already refused the session or the ciphertext will not decrypt, and they revoke at the repository
layer, below the provider helper, so the two can never be confused.

One residue, deliberately left alone: a live authorization code carries a bridge ciphertext of its
own, and a disconnect drops the code (above) without signing out the session it minted. That
session is narrow — it needs a consent that was approved and then never exchanged inside the
code's 10-minute life — and revoking it is a different question, because the code has no token
pair to shred and nothing has ever refreshed it.
