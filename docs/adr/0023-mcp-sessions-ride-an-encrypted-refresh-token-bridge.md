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
