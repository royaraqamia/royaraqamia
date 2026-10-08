# Royaraqamia

Arabic-first member products (Community, Certificates, tracking tools) served through a web app and a public MCP server that AI clients connect to.

## Language

### MCP access layer

**MCP Client**:
An OAuth client registered for the purpose of connecting to the Royaraqamia MCP server.
_Avoid_: integration, consumer, API client

**Public tool**:
An MCP tool callable without any access token.
_Avoid_: free tool, unauthenticated tool, open tool

**Dual-mode tool**:
An MCP tool that serves public data to anonymous callers and the caller's own data once authenticated.
_Avoid_: mixed tool, smart tool

**Consent**:
A signed-in browser user's approval of an MCP client's requested scopes, captured on the connect page.
_Avoid_: acceptance, permission prompt
