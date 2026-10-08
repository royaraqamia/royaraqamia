# The MCP server is dual-mode

The public MCP endpoint at `/mcp` serves two kinds of callers at one door: an **anonymous**
caller (no token at all) may invoke only scope-free public tools — `server_info`,
`certificates_verify`, and the community reads in public-feed mode — while any tool that
touches personal or mutable data requires a full OAuth 2.1 + PKCE session. The 401
`WWW-Authenticate` challenge on personal-data calls is what lets clients (Claude Code,
OpenCode, Codex, …) start the OAuth flow automatically, so the anonymous lane never blocks
that contract. Admin capabilities (`certificates.write`, admin `community.write`) stay
reachable through the same public surface, double-gated by `ADMIN_EMAILS`: once at consent,
again per request (`ADMIN_EMAILS` allowlist is itself an ADR-0003 decision).

## Considered options

- **OAuth-mandatory for everything.** Rejected: breaks the anonymous top-of-funnel tools
  (certificate verification) and makes agents do an OAuth dance just to list the menu.
- **Fully open, everything pre-scoped to anonymous RLS.** Rejected: muddles the scope model
  and pretends mutable tools can ever be anonymous.

## Consequences

`mcp-auth` must resolve anonymous contexts instead of hard-rejecting tokenless requests, and
each tool module keeps enforcing its own guards (RLS remains the second line). This makes the
stale comment in `app/mcp/route.ts` truthful: anonymous callers genuinely reach only
scope-free tools. The public identity of "public tool" vs "dual-mode tool" is fixed in
`GLOSSARY.md`.
