# The app picker hosts apps we do not own

> **Amended by [ADR 0159](0159-the-apps-sheet-is-the-one-apps-surface.md)**, which
> turns the marketplace row into a tab, makes the picker the sheet's first tab,
> and retires the account row for the inbound list.

`تطبيقاتنا` lists nine apps we ship. A member who works in Notion, Linear or a calendar had no
way to let نور reach it, while every other assistant of this generation offers exactly that.
This records where those apps live, where their catalog comes from, and what stands between a
stranger's tool and a member's data. The build plan is
[specs/mcp-marketplace.md](../specs/mcp-marketplace.md).

## The decision

1. **They are behind the same door, and behind one row inside it.** The sheet is the only
   surface a member already opens by reflex, so the marketplace is a row under the nine apps —
   not a route buried in settings — and the two groups are separated by a divider and a section
   label. A stranger's app never takes a peer slot beside `/quran`: the picker's job is to say
   what we ship, and the marketplace is a different promise. The row is `pickerOnly`, so it never
   becomes a homepage tab with no app behind it.

2. **The screen has two tabs, because a grant has two directions.** «تطبيقاتنا المتصلة بنا» is
   the inbound one that already existed at `/account/connected-apps`; «تطبيقات نور» is the
   outbound one. A member asking "what can reach my account" and "what can نور reach" is asking
   one question, and splitting the answer across two screens is how the second one stays
   unread.

3. **The catalog is the official MCP registry, mirrored — never proxied.** The registry's own
   documentation says it is not meant to be consumed by host applications, that it is in
   preview with possible data resets, and that it delegates security scanning to downstream
   marketplaces. So an hourly cron copies it into `mcp_catalog_servers`, and the sheet reads our
   table. A registry outage or reset becomes a stale catalog, not an empty screen.

4. **Every remotely reachable row is listed, with a takedown switch instead of an approval
   queue.** A reviewed-only list would be honest and would be empty. What the registry verifies
   is the namespace, not the behaviour, so what we add is not a gate but the two controls that
   matter at the point of use: a permission level per app, and a card before any write.

5. **Only what a serverless function can actually reach.** `streamable-http` remotes on public
   hosts; no stdio packages, no private-network addresses, `https` on 443 only. One client
   module owns every outbound request, so the SSRF policy is a single reviewable diff.

6. **Nothing writes without a card unless the server itself says it only reads.** The tool's
   `annotations.readOnlyHint` is the only automatic pass. Inference about what a stranger's tool
   is "probably" safe to do is how a marketplace becomes an incident. A per-app permission level
   — always ask, reads, all — is the member's own widening, and it is theirs to give.

7. **The tool list does not grow with the catalog.** A turn declares the 21 tools we own plus at
   most 16 remote ones, chosen lexically from the member's message, with `find_app_tools` as the
   recovery path. Sending every connected server's schema on every turn would cost more per turn
   than the answer and would make the model worse at choosing.

8. **A connection is usable the moment it is made.** Connecting is already a consent; a second
   switch is a second confirmation of the same decision. The post-connect screen shows the tool
   list, which tools write, and the switches, so the member sees what "on" means at the instant
   they could still change it.

9. **One pool of connections, and every remote call metered.** `mcp_connected_apps` stops
   counting inbound grants only: it counts grants **plus** connections against one number — 5 on
   free, 50 on pro — and reserves no slot per direction, because a member who never connects an
   agent should not be told they have four slots they cannot use. Calls get a counter of their
   own (`mcp.call`, free 5 / pro 50 a day) and a read spends it exactly as a write does: the
   meter exists to bound egress, a stranger's rate limit and a looping server, and a read causes
   all three. `chat.agent.turn` remains the meter for what the model costs.

10. **The screens are `/mcp/apps`, and the old inbound URL redirects into them.** The family
    already carries "no canonical URL, no crawler, needs the network, wears this chrome", so the
    marketplace inherits those rules instead of restating them. `/account/connected-apps` becomes
    a redirect to `?tab=inbound` rather than a second body for the same list — a tab that
    teleports the member to another page is worse than a redirect nobody sees.

11. **A remote tool is named twice.** `app_notion_search` for the model, per turn, never stored;
    `app:<connectionId>:<tool>` for the audit row, stable across a rename or a second account
    with the same name. One form to choose with, one to remember with.

## Considered options

- **A standalone `/apps` marketplace route, with the picker unchanged.** Rejected: it is a
  second door for the same idea, and the picker is the one control the shell mounts on every
  screen.
- **External apps as rows in the nine.** Rejected: a member cannot tell our promise from a
  stranger's, and every later row of ours would compete with an unbounded list.
- **A curated catalog only.** Rejected by the owner, and honestly so: the registry exists
  precisely to be aggregated, and a review queue nobody staffs is a list of fifteen apps
  forever.
- **ChatGPT's four permission levels verbatim.** Rejected in part: "allow low-risk actions"
  cannot be decided for a tool we did not write, and a level whose meaning is a guess is worse
  than two levels whose meaning is a rule.
- **Expose every connected tool on every turn.** Rejected on cost and accuracy: the payload
  grows with the catalogue and the model's tool choice degrades before the bill does.
- **API keys and unauthenticated servers in v1.** Deferred: OAuth with DCR is the path the
  registry's remote servers actually take, and a key-paste box is a secret-handling surface we
  would rather design once.

## Consequences

- `chat_agent_actions` gains namespaced tool names (`app:<connection>:<tool>`), so
  `CHAT_AGENT_TOOL_NAMES` is no longer the only shape it holds; both clients' proposal cards
  read the app's name from the connection, not from a label map.
- Six service-role-only tables, a cron, an admin takedown screen and a new copy source arrive
  with the first phase; `security-review` is mandatory on the change that adds them.
- A remote tool result is untrusted content by construction, and the system prompt's rule
  against it is a second line, not the first.
- The assistant's cost per turn stops depending on how many apps a member connected.
- The app port is gated like every other: the screen is drawn from the web's document and
  switched on only when `check:visual` says it is the same screen.
- The pricing page is part of the first release, not a follow-up: `mcp_connected_apps` moves from
  1 / 10 to 5 / 50, its label stops saying "inbound", and `pricing-view.tsx`, the account plan
  card, the loader label and `plan_reads_test.sql` all quote the old numbers today.
- The Postgres `owned_item_count` function and its TypeScript twin in `usage-repository.ts` must
  gain the outbound sum in the same change, or the cap enforced at connect and the number drawn
  on the pricing page disagree.

## Related

- [ADR-0113](0113-a-chat-is-a-conversation-a-membership-and-a-message.md) — the assistant and
  the proposal/confirm contract this reuses.
- [ADR-0143](0143-the-assistant-has-a-door-on-every-screen.md) — نور's name and door.
- [ADR-0146](0146-the-homepage-is-the-app-door.md) — the picker this extends.
- [ADR-0152](0152-two-pages-leave-the-app-picker.md) — why the picker is a promise, not a menu.
- [ADR-0021](0021-the-mcp-server-is-dual-mode.md) — the inbound MCP surface, whose grants
  become the first tab.

## Amendment (2026-11-12, #1269): a row names how it is authenticated

Decision 6 said OAuth 2.1 with dynamic registration, and nothing else. That was the right default
and the wrong absolute: it made the store refuse servers that need no credentials and servers that
take a member's own key, and the store's `connectable = true` query hid every one of them behind a
probe that could only look for OAuth documents.

Measured 2026-11-12: `POST https://docs.mcp.cloudflare.com/mcp` answers `initialize` and
`tools/list` with no credential, while every `/.well-known` path answers `404`. Measured the same
day: `https://mcp.postman.com/mcp` answers `401` with `WWW-Authenticate: Bearer
resource_metadata="…"` and a body that says `API key required`, and Postman documents its API key
as a bearer token in `Authorization`. The first is a server decision 6 made unlinkable; the second
is a credential shape the flow never had.

So a catalogue row now carries one of three modes, and the connect flow has a branch for each:

1. **`oauth`** is decision 6 unchanged — discovery, DCR or a reviewed client, PKCE, refresh.
2. **`none`** connects without leaving the site: the connection is created, `tools/list` is read
   with no credential, and the tool list is what proves the link.
3. **`api_key`** connects from a key the member pastes. The key is encrypted with the same
   `encryptSecret` path as a token, stored in `mcp_connection_credentials`, sent only in the header
   the row names, and never written to a URL, a log or a response. It is replaced, not re-consented,
   from the connection screen — the rotation path this amendment exists to make possible.

The mode is an **admin's decision, not a probe's**. Which header a key belongs in is a documented
fact the probe cannot read, and a server that publishes nothing must not be inferred into a mode.
The probe measures beside the decision (`probe_auth_mode`: `oauth` when metadata and registration
answered, `none` when the handshake answered without a credential, `api_key` when the endpoint
refused one without naming a bearer token) and its verdict says whether the row's decision opens
the server. A row whose mode changed loses its verdict in the same write, because the measurement
was taken against the old flow. The Admin Console draws the decision and the measurement side by
side, so «this is published as OAuth, but the server answered without credentials» is a sentence
an admin can act on.

Four things this does not change:

- **The write-card rule.** A key is a credential, not a permission level: a tool that is not
  `readOnlyHint` still becomes a proposal, whatever the mode.
- **Metering.** `mcp.call` counts a call from any mode the same way; the 3-per-turn ceiling is
  unchanged.
- **The shared pool.** A `none` or `api_key` connection is a connection: it spends one of the 5 /
  50 slots and is freed by disconnecting. The pool counts connections, not credentials.
- **The egress policy.** All three modes open the socket through `backend/clients/mcp-remote`, the
  one module that speaks to a stranger's server.

What the security review of this change covered: the key is entered in a password field and never
rendered back; the refusal sentences never echo it; the ciphertext is the only stored form and the
column is service-role only; rotation is authenticated, owner-scoped and available while the
provider's takedown is in force; and a `none` connection holds no credential row at all, so there
is nothing to leak if the mode was wrong.

The catalogue agent gains the class the wait-reason enum was reserving: a no-auth row is publishable
when the probe's handshake passes (`probe` + `tools` + `admission`), and a key row is not — its
credential does not exist until a member pastes one, so the run refuses to raffle it and leaves the
vouch to the admin who chose the mode.
