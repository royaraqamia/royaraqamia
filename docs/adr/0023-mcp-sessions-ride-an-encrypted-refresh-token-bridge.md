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
