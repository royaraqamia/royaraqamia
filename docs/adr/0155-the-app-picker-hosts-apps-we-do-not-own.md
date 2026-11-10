# The app picker hosts apps we do not own

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
