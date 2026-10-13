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
consent. That copy cannot survive: Supabase rotates refresh tokens on every refresh and
revokes the whole family the moment it sees one reused, while the browser keeps rotating its
own copy (`SessionProvider` plus `updateSession`, see `backend/middleware/session.ts`). By the
time the data plane drained the bridge, the copy was the already-used token. GoTrue revoked
the family and every authenticated MCP call answered 401 — permanently, because `/mcp/token`
kept refreshing the _MCP_ token successfully, so no client ever learned it had to
re-authorize. The runbook in `docs/security.md` promised clients would re-run the browser flow
"auto-triggered"; nothing triggered it.

Two changes:

- **Mint the bridge.** Consent now exchanges an admin-generated magic-link OTP for a second,
  independent Supabase session for the same user
  (`backend/services/mcp/bridge-session.ts`). Nothing else rotates it, so the reuse race is
  gone. It is still a genuine Supabase session — RLS, `auth.uid()`, bans and deleted users all
  still apply — so this is _not_ the rejected "MCP-specific credentials" option: the identity
  stays Supabase's, only the copy stops being the browser's.
- **Retire dead grants.** When the bridge cannot be revived — the refresh token is
  definitively rejected, the ciphertext will not decrypt (key rotation, the intended kill
  switch), or the row carries no session — the data plane revokes the grant's access _and_
  refresh rows. The client's next refresh is then answered `invalid_grant`, which makes it drop
  the credential and re-run the browser flow. Transient failures (network, 429, 5xx, a rotated
  publishable key) revoke nothing.
