# MCP client registration stays open

Any MCP client may self-register against `/mcp/register` (RFC 7591 dynamic registration) and
connect by OAuth 2.1 + PKCE — no account approval, no manual allowlist. The only upfront
constraints are mechanical: registration is rate-limited (Upstash) and redirect URIs must be
`https:`, with an exception carved out for `http://localhost*` so developers can test with a
local agent.

## Considered options

- **Approval-gated registration.** The `mcp_oauth_clients.registration_token_hash` column
  was built for exactly this and remains the escape hatch: if abuse appears, a registration
  token can be switched on without schema changes. Rejected for v1: it is pure friction for
  the overwhelmingly common case — a developer pasting a server URL into Claude Code — and
  redirects are already verified against the registered allowlist at authorize time.
- **A pre-seeded fixed client list.** Rejected: kills the "paste the URL and go" experience
  that a public MCP guide page promises, and doesn't scale to arbitrary third-party agents.

## Consequences

`/mcp/register` remains an unauthenticated endpoint, buffered only by the rate limit; the
unknown `registration_token_hash` column is repurposed, not removed, when gating is ever
needed. A future reader tempted to "harden" this into an approval flow should first weigh
that the adversarial surface it protects is one validated redirect allowlist, not a token
issuer.
