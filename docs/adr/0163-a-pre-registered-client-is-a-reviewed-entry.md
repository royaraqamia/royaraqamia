# A pre-registered client is a reviewed entry, not a default

The connect flow refuses a server that publishes no RFC 9728 metadata, and one that publishes
everything except `registration_endpoint` (RFC 7591). That refusal is right: a guessed endpoint is
how a consent screen sends a member to a host nobody agreed to. But the refusal has a cost, and the
cost falls on the members: GitHub, Notion, Figma, Atlassian and Stripe are the apps they ask for,
and the store answered "not connectable" for three of them. This records how a provider gets a
client we registered by hand without turning "we know this one" into "guess anything".

## The decision

1. **The table is code, the secret is environment.** `backend/config/mcp-static-clients.ts` names,
   per catalogue row, the authorization server, both endpoints, the scopes and the token-endpoint
   auth method, each with the date it was read. The environment carries only
   `MCP_STATIC_CLIENT_<KEY>_ID` and `MCP_STATIC_CLIENT_<KEY>_SECRET`. A definition whose
   `client_id` is absent is inert: its row behaves exactly as it did before, and the store still
   says it cannot be connected.

   The table is deliberately not a fallback map (`registry_name → discovery`) consulted when
   discovery fails. An entry exists because a person measured that provider and created an app in
   its console; nothing is derived, and a row with no entry gets no endpoints it did not publish.

2. **A pre-registered row skips discovery and registration.** `start` and `complete` build the same
   `McpDiscovery` shape from the entry, so the authorize URL, the token exchange and the refresh
   path do not branch on where the endpoints came from — only on whether there is anything left to
   register. `mcp_connection_credentials.registration_kind` records `static`, and the secret is
   encrypted on the way in exactly like a dynamically registered one.

   `complete` never registers. A callback is a consent coming back, not a place to create a client,
   and the row's attempt carries the row name that resolves the same entry again.

3. **Scopes are declared, but only here.** The DCR path asks for no scope on purpose: the provider's
   default is the starting grant, and widening it is a decision someone makes on purpose. A
   hand-registered app has no such default — an empty scope asks GitHub for almost nothing — so the
   reviewed entry names the scopes its app was created for, and they are sent at authorization.
   GitHub's entry asks for `repo read:org read:user user:email read:project` and leaves `gist`,
   `notifications` and `write:packages` out: the consent screen asks for what the agent can use.

4. **The probe cannot veto a reviewed row.** A provider may hide its metadata from a datacenter IP
   (`mcp.notion.com` answers `403` to a probe and `mcp.figma.com` answers `451`), and that is not
   evidence the connection fails — it is evidence the probe cannot see it. A row with a client is
   `connectable` regardless; the document is still read for the brand mark, and the egress policy
   can still refuse the host. The Admin Console badges the row «عميل مسجّل مسبقاً», so the admin's
   verification is a decision about a known path rather than a measurement they cannot repeat.

5. **A provider the registry does not carry is a curated row.** GitHub has no entry in the official
   registry at all, so there is nothing for the mirror to copy. `catalog-service.ts` writes the row
   itself on every sync, **before** the sweep that retires rows the registry stopped serving, and
   seeds and probes it with the launch set. A curated row is a publisher entry, not a vouch: the
   admin still verifies it, and the store still hides it until its verdict is true.

6. **Adding a provider is a checklist, and it stays one.** Measure the provider's resource and
   authorization metadata; create the app in its console with the callback
   `https://royaraqamia.com/mcp/callback`; add the definition and the two environment variables; run
   the sync; verify the row. Production is the only registered callback: previews get a second
   registration row per provider otherwise, and the table is keyed per redirect URI for exactly that
   reason.

## Consequences

- The store can offer a provider whose metadata we cannot read, as long as a person read it once and
  the entry says when. That is a weaker guarantee than a live probe, and the badge says so.
- A secret lives in two places at most (the provider's console and the deployment's environment),
  never in the repository and never in the database as plaintext.
- `docs/specs/mcp-marketplace.md` carries the provider table: which path each one takes, which
  client it uses, and which scopes it asks for. It is updated in the same change that adds an entry.
- Notion and Figma are not in the table yet: both refuse this network (`403` and `451`), so their
  verdict comes from the deployment's egress before anyone decides they need a client at all.
