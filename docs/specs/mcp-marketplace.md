# The MCP marketplace — plan

نور currently answers with 21 tools we own. This plan gives a member the ability to
connect **apps we do not own** — a remote MCP server she reaches on their behalf — and to see
both directions (apps reaching us, apps we reach) on one screen behind `تطبيقاتنا`.

Nothing here is built yet. The decisions below were settled with the owner; the open
questions at the end are the ones still unanswered.

## What already exists

| Piece                                        | Where                                                                                                         | Reused how                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Assistant turn loop with tools               | `backend/services/chat/chat-agent-service.ts`                                                                 | The remote tools ride the same loop, the same bounded rounds        |
| OpenAI-compatible client with function calls | `backend/clients/ai-chat.ts`                                                                                  | Unchanged; the `tools` array is assembled by name                   |
| First-party tool registry                    | `backend/services/chat/chat-agent-tools.ts`                                                                   | Gains a second source; its 21 tools stay always-declared            |
| Proposal → confirm for writes                | `shared/contracts/chat-agent-actions.ts`, `app/api/chats/[id]/agent-actions/[actionId]/confirm`, `.../reject` | Every remote write that is not `readOnlyHint` goes through it       |
| Our MCP server (inbound)                     | `app/mcp/*`, `backend/services/mcp/*`                                                                         | Untouched; its grants move into the second tab                      |
| Connected-apps list/disconnect               | `backend/controllers/mcp-connected-apps.ts`, `frontend/ui/account/mcp-connected-apps-view.tsx`                | Becomes the inbound tab                                             |
| AES-256-GCM secret storage                   | `backend/shared/mcp-token-crypto.ts`                                                                          | Stores third-party tokens the same way the bridge session is stored |
| Sweep + cron pattern                         | `sweep_expired_mcp_oauth_tokens`, `sweep_expired_mcp_oauth_auth_codes`                                        | Copied for the connect-attempt table                                |
| The `تطبيقاتنا` sheet                        | `frontend/ui/navbar/services-link.ts` → `ServicesMenuItems`, `ServicesSheet`                                  | Gains one row and a section                                         |
| Plan caps                                    | `owned_item_states`, `OWNED_ITEMS.mcpConnectedApps` (1 free / 10 pro, inbound only)                           | Becomes one shared 5 / 50 pool: grants + connections                |

Nothing exists for the reverse direction: no `@modelcontextprotocol/sdk/client` import, no
OAuth client role, no third-party credential table, no egress policy, and the assistant's
tool names are a compile-time union (`CHAT_AGENT_TOOL_NAMES`).

## Locked decisions

1. **Both directions, one screen.** Two tabs: inbound grants (who reaches us) and outbound
   connections (which apps نور reaches). Reached from `تطبيقاتنا`.
2. **The sheet separates them visually.** Our own apps keep the sheet to themselves; one row
   under them opens the marketplace, behind a divider and a section label. A stranger's app
   never sits beside `/quran` as a peer. The row is `pickerOnly`: it draws in the sheet, and it
   is excluded from `HOME_SERVICE_ROUTES`, so it never becomes a homepage tab with no app behind
   it. `shared/contracts/__tests__/home-services.test.ts` asserts that the sheet's live rows are
   exactly the home catalog, so it learns the flag in the same change.
3. **The catalog is the official registry, mirrored.** An hourly cron pulls
   `https://registry.modelcontextprotocol.io/v0/servers` into our own table. The sheet reads
   our table, never the registry.
4. **The mirror is open; the store is curated.** Every active registry row is mirrored so an admin
   can find it, but a row reaches the store only when an admin **verified** it, the probe measured it
   **connectable**, it is active and unblocked, and it has a brand mark. The registry is the
   haystack; the store is the curated list (ADR-0162). An admin kill switch exists for takedown and
   for withdrawing a vouch.
5. **Remote-only.** Only `remotes[]` entries of type `streamable-http` are kept. npm, PyPI and
   Docker packages are stdio servers we cannot run, and private-network hosts are dropped at
   ingest and again at connect.
6. **OAuth 2.1 with DCR.** Dynamic client registration, PKCE S256, discovery through
   `/.well-known/oauth-protected-resource` then `/.well-known/oauth-authorization-server`. No
   API-key or no-auth mode in v1.
7. **Writing is a card by default.** A remote tool runs inside the turn only when the server
   declares `annotations.readOnlyHint: true`. Everything else becomes a proposal the member
   confirms. A per-connection permission level can widen this; it never widens by inference.
8. **Tool injection is selective.** A lexical pre-filter picks at most 16 remote declarations
   per turn against the member's message; the 21 first-party tools are always present. A
   `find_app_tools` read tool is the fallback when the filter misses.
9. **On when connected.** The connection is usable immediately, and the post-connect screen
   shows the tool list, which tools write, and the switches — one click from limiting it.
10. **One shared pool of connections, free 5 / pro 50.** `mcp_connected_apps` stops being an
    inbound-only count: the number is live inbound grants **plus** outbound connections, and
    nothing reserves a slot per direction. A member who never connects an agent may spend all
    five on apps نور reaches; a member who does both spends from the same five. The refusal
    names the shared total, not a direction.
11. **Every remote call is metered.** A new `mcp.call` counter, free 5 / pro 50 a day, counts a
    read as well as a write. It guards egress, a stranger's rate limit and a server that loops,
    which a read causes as readily as a write; model spend is already guarded by
    `chat.agent.turn`. The turn ceiling stays at 3 remote calls as the valve inside one turn.
12. **Both clients at launch.** The web screen is the reference; the Kotlin port shares the
    copy, the states and the parity rows, and is switched on by `check:visual`.
13. **The screens live under `/mcp`.** `/mcp/apps` and `/mcp/apps/<id>`, beside `/mcp/guide` and
    `/mcp/connect`. The family already carries the rules a member's own app list needs — no
    canonical URL, disallowed in `robots.ts`, `online-only-deadline` in
    `shared/contracts/offline-metrics.ts`, and the chrome that `/mcp/*` already declares — so
    this costs no new classification in either client.
14. **The inbound list moves, and its old URL redirects.** The existing list is rendered inside
    the first tab, whose state is `?tab=inbound`; `app/account/connected-apps/page.tsx` becomes a
    redirect to it, so the account row, a bookmark and the app's screen table keep resolving. A
    tab that teleports the member to another page is worse than a redirect nobody sees.
15. **A remote tool has two names.** The model sees `app_notion_search` — readable, per turn,
    never stored. The audit row in `chat_agent_actions` stores `app:<connectionId>:<tool>` —
    stable across a rename or a second account with the same name, resolved to a display name
    when the card draws. One form for choosing, one for remembering.

## Data model

New tables, all `service_role` only with RLS on and no `anon`/`authenticated` grant, the same
shape as `mcp_oauth_*`:

**`mcp_catalog_servers`** — the registry mirror.

| Column                                              | Why                                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `registry_name` (pk)                                | `ac.inference.sh/mcp`; the registry's own key                                                                                    |
| `title`, `description`, `version`                   | Straight from the registry, in its words                                                                                         |
| `name_ar`, `description_ar`                         | Nullable overrides; the registry is English-only, and a screen that is otherwise Arabic cannot be left to machine translation    |
| `remote_url`, `transport`                           | The one entry we can actually reach                                                                                              |
| `remote_override`                                   | The admin's choice of remote; the sync never writes it, and `coalesce(remote_override, remote_url)` is what is probed and opened |
| `status`                                            | `active`, `deprecated`, `deleted` from `_meta.io.modelcontextprotocol.registry/official`                                         |
| `published_at`, `registry_updated_at`, `fetched_at` | Freshness, and which rows the cron stopped seeing                                                                                |
| `blocked_at`, `blocked_reason`                      | The takedown switch                                                                                                              |
| `raw`                                               | The registry document, for anything a later phase wants                                                                          |

**`mcp_connections`** — one member's connection to one server.

`id`, `user_id`, `registry_name`, `server_url`, `display_name`, `enabled`,
`permission_level` (`ask` | `reads` | `all`), `status` (`active` | `needs_reauth` | `error` |
`revoked`), `tool_count`, `connected_at`, `last_used_at`, `last_error`.

**`mcp_connection_credentials`** — one row per connection, encrypted with the existing
`encryptSecret`.

`connection_id` (pk), `authorization_server`, `token_endpoint`, `registration_kind` (`dcr` |
`static`), `client_id`, `client_secret_enc`, `access_token_enc`, `refresh_token_enc`,
`scope`, `expires_at`, `issued_at`, `metadata` (the discovery document).

**`mcp_connection_tools`** — what we learned from `tools/list`, and the switches.

`connection_id`, `tool_name` (pk together with the connection), `description`, `input_schema`,
`read_only`, `enabled`, `last_seen_at`. A tool the server stops advertising is marked stale,
not deleted, so a member's switch survives a server's bad day.

**`mcp_connect_attempts`** — the in-flight OAuth handshake.

`state_hash` (pk), `user_id`, `registry_name`, `server_url`, `code_verifier_enc`,
`redirect_uri`, `created_at`, `expires_at` — swept by a cron beside the auth-code sweep,
because a code verifier in a cookie is a verifier the browser can lose.

**`mcp_oauth_client_registrations`** — our identity at each authorization server.

`authorization_server` + `redirect_uri` (pk), `client_id`, `client_secret_enc`,
`registration_kind`, `registered_at`. DCR is per redirect URI, so a preview deployment and
production are different registrations; this is what keeps that from becoming a bug.

Existing tables touched: none structurally. `chat_agent_actions.tool` gains namespaced values
(`app:<connectionId>:<tool>`), so `CHAT_AGENT_TOOL_NAMES` stops being the only shape it holds.

## Layers

`controller → service → repository/client`, DI in `backend/config/`, as everywhere:

- `backend/clients/mcp-remote.ts` — **the only** module that speaks to a third-party server.
  Discovery, DCR, token exchange, refresh, `initialize`, `tools/list`, `tools/call`. One home
  for the egress policy below.
- `backend/repositories/mcp/marketplace-repository.ts` — catalog, connections, credentials,
  tools, attempts.
- `backend/services/mcp/marketplace/*` — catalog sync, connect flow, token lifecycle, tool
  catalogue, the router.
- `backend/services/chat/chat-agent-tools.ts` — unchanged in shape; a second resolver supplies
  remote tools for a turn.
- `backend/controllers/mcp-marketplace.ts` — thin; both the site's routes and the assistant's
  turn call the same service.
- `backend/config/mcp.ts` gains the marketplace wiring beside the existing provider wiring.

## Routes

| Route                                         | Job                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/mcp/marketplace/servers?q=&cursor=` | Search our mirror; Arabic fields where present                                               |
| `POST /api/mcp/marketplace/connections/start` | Discovery + DCR + PKCE, answers the authorize URL                                            |
| `GET /mcp/callback`                           | Third-party redirect; validates state, exchanges the code, ingests tools, lands on the sheet |
| `GET /api/me/mcp/connections`                 | The outbound list, with status and tool counts                                               |
| `PATCH /api/me/mcp/connections/[id]`          | `enabled`, `permission_level`, `display_name`                                                |
| `DELETE /api/me/mcp/connections/[id]`         | Revoke at the provider where it supports it, delete locally                                  |
| `PATCH /api/me/mcp/connections/[id]/tools`    | One tool's switch                                                                            |
| `GET /api/cron/mcp-catalog`                   | Daily registry sync, resumable; `CRON_SECRET` guarded like the others                        |
| `GET /api/admin/mcp/catalog?q=&cursor=`       | The takedown list, blocked rows included                                                     |
| `PATCH /api/admin/mcp/catalog`                | Block with a reason, undo a block, or write the Arabic overrides                             |
| `GET /admin/mcp/marketplace`                  | Takedown list: hide or block a row with a reason                                             |
| `GET /account/connected-apps`                 | Redirects to `/mcp/apps?tab=inbound`; the page keeps its URL, not its body                   |

`/mcp/callback` is `no-store` and requires a session: it is the only route where a stranger's
redirect becomes credentials.

## The connect flow

1. The member taps a row. `POST .../connections/start` runs discovery:
   `GET {url}/.well-known/oauth-protected-resource` → the authorization server(s), then
   `GET {authorization_server}/.well-known/oauth-authorization-server` → endpoints and scopes.
2. No cached registration for this authorization server and redirect URI, and the server
   offers `registration_endpoint` → DCR with our client name and redirect URI. A server that
   refuses DCR is not connectable — unless the row carries a reviewed pre-registered client, in
   which case step 1 and step 2 are both skipped («Pre-registered clients», below).
3. Build the authorize URL: PKCE S256, `state`, our scopes mapped to what the server advertises.
   Store the attempt (verifier encrypted, hashed state), then redirect.
4. The provider consents and redirects to `/mcp/callback?code&state`.
5. We validate the state, exchange the code, encrypt the tokens, `initialize`, `tools/list`,
   upsert `mcp_connection_tools`, and land on the post-connect screen.
6. Refresh happens on use: an expired access token is refreshed behind a per-connection lock;
   `invalid_grant` marks the connection `needs_reauth` and the row says «أعد الربط» rather than
   failing a turn with a provider error.

**No scope is requested**, at registration or at authorization. Declaring every scope a server
publishes would ask the member for the widest consent the provider offers, on the strength of a
guess about which tools need what; the provider's own default is the starting grant, and widening
it is a choice someone makes on purpose. What that default actually is gets recorded here once a
real connection is measured. The one exception is a pre-registered client, which has no provider
default: its reviewed entry names the scopes its app was created for, and they are sent.

### Measured against real servers (2026-11-10, re-measured 2026-11-11)

Eleven popular remote servers, probed for RFC 9728 resource metadata, an authorization server and
dynamic registration:

| Server                                              | Connectable    | Why not                                                                                                                                     |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Linear, Sentry, Vercel, Supabase, Canva, Cloudflare | yes            | DCR + PKCE S256 published                                                                                                                   |
| Atlassian                                           | yes            | root 404, but the `401` names the path-aware document; tenant AS publishes DCR                                                              |
| Stripe                                              | yes            | `mcp.stripe.com` publishes RFC 9728 + AS metadata + DCR (it did not on 2026-11-10); its catalogue row probe was still pending on 2026-11-11 |
| GitHub                                              | pre-registered | resource metadata exists; `github.com/login/oauth` publishes no `registration_endpoint`                                                     |
| Notion, Figma                                       | yes            | measured from the deployment's egress; both publish metadata and DCR — the earlier `403`/`451` were this network, not the provider          |

The 2026-11-10 table read as "four of the most requested apps cannot be connected". Measured again
from the deployment on 2026-11-11, that was true of **one**: GitHub. Atlassian and Stripe publish
what the flow needs (Atlassian behind the `401` challenge the probe already follows), and Notion and
Figma publish it too once the request comes from a datacenter that is not geo-blocked. A
pre-registered client is still the right mechanism for the providers that genuinely refuse DCR, but
it is no longer the reason the other four were missing.

A server that publishes no resource metadata at all is still refused, and phase 2's catalogue says
which rows can be connected before a member taps one («The connectable verdict», below), rather than
explaining it after a refusal.

### Pre-registered clients (#1229)

A provider that publishes everything except `registration_endpoint` — GitHub is the measured case —
cannot be reached by the flow above. Guessing its endpoints is the refusal the client exists for, so
the alternative is a **reviewed entry**: the endpoints a person measured, and a client a person
created in that provider's console.

- **The table is code, the secret is environment.** `backend/config/mcp-static-clients.ts` names,
  per catalogue row, the authorization server, both endpoints, the scopes and the token-endpoint
  auth method, with the date each was read. The console supplies only
  `MCP_STATIC_CLIENT_<KEY>_ID` and `MCP_STATIC_CLIENT_<KEY>_SECRET`. A definition with no
  `client_id` is inert: its row behaves exactly as before.
- **A row with a client skips discovery and registration.** `start` and `complete` build the same
  discovery shape from the entry, so the authorize URL, the token exchange and the refresh path do
  not branch on where the endpoints came from. `mcp_connection_credentials.registration_kind`
  records `static`, and the secret is encrypted on the way in like a registered one.
- **The probe cannot veto it.** A pre-registered row is `connectable` even when the provider hides
  its metadata from our probe, because a person measured the flow; the document is still read for
  the brand mark, and the egress policy can still refuse the host. The Admin Console shows a
  «عميل مسجّل مسبقاً» badge, so verification is a decision about a known path.
- **A provider the registry does not carry is a curated row.** GitHub has no entry in the
  registry at all, so `catalog-service.ts` writes the row itself (`CURATED_SERVERS`) on every
  sync, before the sweep that retires rows the registry stopped serving. It is a publisher entry,
  not a vouch: the admin still verifies it, and the store still hides it until its verdict is true.
- **Adding a provider** is: measure its resource and authorization metadata, create the app in its
  console with the callback `https://royaraqamia.com/mcp/callback`, add the definition and the two
  environment variables, run the sync, then verify the row in the Admin Console.

Which path each provider takes today:

| Provider                                            | Path                                                            | Client                                    | Scopes                                            |
| --------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| Vercel, Linear, Supabase, Sentry, Canva, Cloudflare | DCR                                                             | none                                      | provider default                                  |
| Atlassian                                           | DCR (path-aware resource document, tenant authorization server) | none                                      | provider default                                  |
| Stripe                                              | DCR (`access.stripe.com/mcp`)                                   | none                                      | provider default                                  |
| GitHub                                              | static                                                          | `MCP_STATIC_CLIENT_GITHUB_ID` / `_SECRET` | `repo read:org read:user user:email read:project` |
| Notion, Figma                                       | DCR                                                             | none                                      | provider default                                  |

## The catalogue mirror (phase 2, #1223)

### The registry is bigger than one invocation

Measured 2026-11-10: `GET /v0/servers?version=latest&limit=100` answers **more than thirty
thousand rows**, and a sweep that pages through all of them does not finish inside the 60s a
serverless function gets. The mirror is therefore a **resumable pass**, not one request:

- `mcp_catalog_sync_state` holds one row: where the pass stopped (`cursor`), when it began
  (`pass_started_at`), how many rows it has seen (`pass_rows`), and when the last run finished.
- A run pages until its own 35s deadline, saves the cursor, and the next run continues.
- `version=latest` is the registry's own dedupe. Without it the API returns every published
  version of every server, and the mirror would keep whichever one was written last.
- After the first completed pass, a run is **incremental**: `updated_since` = the last run minus
  one hour. That is also the only query that reports a server the registry removed, because the
  API includes deleted rows whenever `updated_since` is set.
- A row the registry stopped serving is marked `deleted`, never removed: a live connection
  references it. That marking happens **only when a pass reaches the end and clears two floors**:
  at least 100 rows, and at least half of what the store already holds. A pass that ends after a
  handful of rows is an outage, and a pass that saw a fraction of the catalogue is a truncated
  registry; neither may empty the screen. A genuine reset below that bar is deliberate: clear
  `mcp_catalog_sync_state.pass_completed_at` and the next run is a full pass again.
- A failed run does not move the incremental baseline, so the next run re-reads what it missed.

The schedule is **daily**, not hourly: this deployment is on a plan whose crons are daily, and the
two that already exist are. The pass is time-budgeted and resumable, so moving to hourly is a line
in `vercel.json` and nothing else.

### The connectable verdict

`connectable`, `connectable_reason` and `probed_at` are columns, because the answer has to reach
the screen **before** the tap. The probe is the connect flow's own discovery under a 4s ceiling:
resource metadata, authorization metadata, and a `registration_endpoint`. `connectable` is `true`
only when all three are there; otherwise the row carries one of three codes —
`no_metadata`, `no_registration`, `blocked` — and the screen says so in words.

It is filled **on demand**, for the rows a screen actually draws:

- A search returns a page of at most 20 rows; the unprobed ones among them are probed **after**
  the response is flushed (`after()`), at most five per request. A member's search never waits on
  five strangers' servers.
- A verdict stands for seven days; a row whose effective address
  (`coalesce(remote_override, remote_url)`) moved loses it in the same write, because the address is
  what was measured.
- `null` is a third state, not a silent "no": the Admin Console says «لم نتحقق بعد», and the row is
  not in the store until an admin has a verdict and verifies it. A member's store never lists a row
  whose verdict is not `true`, and a probe that times out is recorded as `unreachable` rather than
  `no_metadata`, because a server that never answered is not a server that published nothing.

### Choosing a remote

The registry publishes several `remotes[]` for one server, and the mirror keeps
only the first `streamable-http` entry the egress policy accepts. That first entry
is the publisher's ordering, not a judgement about which server a member needs:
`com.cloudflare.mcp/mcp` lists `https://docs.mcp.cloudflare.com/mcp` — a no-auth
docs server that publishes no RFC 9728 document — and the account server at
`https://observability.mcp.cloudflare.com/mcp` beside it, which does. The mirror
measured the wrong one and the store hid a server that can be connected.

So the address is a decision an admin can make:

- **`remote_override`** holds it, and the sync never writes it — the same shape as
  `title_override`. The **effective address** is `coalesce(remote_override,
remote_url)`: the probe measures it and the connect flow opens it, so the verdict
  an admin reads is about the server a member will actually reach.
- **Selecting is a list and a field.** The Admin Console lists the `remotes[]` from
  the row's `raw` registry entry and accepts any `https` URL the egress policy
  would let us fetch. A URL nobody selected is never probed; clearing the field
  follows the registry's own choice again, so a pinned address is a deliberate act
  and not a default.
- **The probe asks three sources, in this order:** the root
  `/.well-known/oauth-protected-resource`, the path-aware
  `/.well-known/oauth-protected-resource/<resource-path>`, and finally the
  `resource_metadata="…"` URL a `401` on the MCP endpoint names in
  `WWW-Authenticate`. A `404` at the root followed by a `200` at the path-aware
  address is **connectable**, not `no_metadata`; only a host that answered nothing
  at all is `unreachable`.
- **A moved address loses its verdict.** Changing the override clears
  `connectable`, `connectable_reason`, `probed_at` and the probe's mark in the same
  write, exactly as a registry URL change does, and the row reads «لم نتحقق بعد»
  until «فحص الآن» runs. The registry moving its own first remote does **not**
  clear a verdict that was measured at an override, because that address did not
  move.

### The store is curated (ADR-0162)

The mirror and the store are two different lists. The mirror keeps every active `streamable-http`
row so an admin can find a server by name; the store draws only rows that satisfy all of:

- `verified_at is not null` — an admin vouched for the publisher, the name, the description and the
  mark. Verification is a decision, not a measurement.
- `connectable is true` — the probe measured RFC 9728 metadata, an authorization server, and a
  dynamic registration endpoint. A row whose verdict is `null` or `false` is not offered; the admin
  screen is where «لم نتحقق بعد» and «لا يمكن ربطه» live.
- `status = 'active'` and `blocked_at is null`.

Verification is refused when the probe has not measured the row connectable, and the sync re-probes
verified rows on every run, so a server that goes down stops being offered and one that comes back
returns without an admin remembering it.

The first day is seeded: the six providers measured connectable below — Vercel, Linear, Supabase,
Sentry, Canva and Cloudflare — are verified by the sync. `verification_withdrawn_at` records an
admin's withdrawal, so the seed is a bootstrap and never overrules the person. The probe still
decides whether each one appears, because the store's query asks for `connectable = true`.

A brand mark comes from three sources, in this order: **`icon_override`** (a mark we ship
ourselves), the server's RFC 9728 `logo_uri` (written by the probe), and the registry's `icons`
(rewritten on every sync). Measured on 2026-11-11, the first two were empty for every row members
ask for most, so the store drew eleven monograms; the marks now ship as white SVGs in
`public/brand/mcp` and `icon_override` holds their same-origin path, written by the sync only where
it is null so a later change survives. The member's browser still never fetches a third party: a
shipped path is served as it is, any other URL goes through `/mcp/icon?name=<registry>` and the same
egress policy, and a row with neither draws a monogram. Canva has no mark in the source set, so it
keeps its monogram rather than a made-up logo.

The Latin name is the same seam: `title_override` is written by an admin and survives the sync, so
`com.vercel/vercel-mcp` draws as **Vercel**. The registry's own `title` stays beside it for the
Admin Console and for a future upstream correction.

The store is drawn in one query, ordered by `featured_rank` (lower first, null last) then
`registry_name`. A curated directory is small enough that it needs no keyset cursor, so the table
needs no generated sort key; a newly verified row appears after the featured ones until an admin
gives it a rank.

### Search

`GET /api/mcp/marketplace/servers?q=&cursor=` reads the mirror, never the registry. The searched
text is one generated column (`search_text`: title, description, both Arabic overrides, and the
registry name) with a trigram index, so a member who types «نوشن» finds a row an admin translated
and one who types `notion` finds it before anyone did. A blank `q` is the whole catalogue.

The Admin Console's list is ordered `registry_name ASC` and its cursor is that key: a title ordering
would read nicer and cost a two-key cursor interpolated into a PostgREST `or()`, which is the filter
syntax hazard `backend/shared/postgrest-or-filter.ts` exists for. The member's store uses the
curated order above and one bounded query. The catalogue is searched, not ranked.

### Takedown and the Arabic overrides

There is no approval queue: every `active` row appears. `/admin/mcp/marketplace` can block one
**with a reason**, which `start` already refuses on with its own sentence, and undo it. The same
screen writes `name_ar` and `description_ar`; a brand keeps its Latin name, and the description
shows the registry's English until an Arabic one is written.

The admin screen's words live in `shared/contracts/mcp-catalog.ts`, not in `shared/copy/`: that
directory is the site↔app seam, and `scripts/check-parity.mjs` refuses a copy source no ported
component claims. There is no admin console in the app, so a copy file for it would have one side.

## Egress policy (one module, non-negotiable)

Third-party URLs entered by nobody we trust, called from our infrastructure:

- `https:` only, port 443, no userinfo in the URL, no fragments.
- Reject IP literals; reject private, loopback, link-local, CGNAT, multicast and IPv6 ULA
  ranges; reject `localhost`, `.internal`, `.local`, and any host that resolves into those.
- No redirects (or one, re-validated); no cookies; no ambient credentials; no proxy env vars.
- 5s connect, 20s total, 1 MB response cap, JSON-RPC errors surfaced as tool errors.
- The host is pinned per connection at connect time; a later response cannot move it.
- A connection's tools are read again on reconnect only, never mid-turn.

## Tool injection and the turn

- **Namespacing, two forms.** The model sees `app_<slug>_<tool>` — sanitized to `[a-z0-9_]`,
  ≤ 64 characters, unique per member, never persisted. The audit row stores
  `app:<connectionId>:<tool>`, which a rename or a second account with the same name cannot
  disambiguate wrongly; the card resolves its display name from the connection. Neither form is
  ever an argument the model can set.
- **The router.** Before a turn, score each enabled remote tool's name and description against
  the member's message (lexical, no model, no tokens), take the top 16, always add the 21
  first-party tools. Cross-connection duplicates resolve by score, not by connect order.
- **The fallback.** `find_app_tools` is a read tool that searches every enabled connection's
  tools and returns the matches; the next round injects them. Without it, a miss is silent.
- **Writes.** `readOnlyHint === true` → `read`. Anything else → `write`, drawn as a proposal
  whose sentence names the app and the arguments. Confirming calls the remote server; the result
  lands on the action row. `permission_level: reads` allows read-only tools to run and still
  cards every write; `all` follows the member's explicit choice per app.
- **Untrusted output.** A remote tool's result is data, never an instruction. It is bounded at
  `maxResultChars`, it cannot change the level, the switches, or the tool list, and a result
  that looks like a prompt does not get a second round with more tools.
- **Budget per turn.** At most 3 remote calls, inside the existing bounded rounds and the
  existing `AbortSignal`. A turn that hits the ceiling answers with what it has, like the
  round limit does today.

## Plans and metering

- **Connections, one pool.** `mcp_connected_apps` becomes free 5 / pro 50, and the count is
  `distinct live inbound clients` + `active outbound connections`. Nothing reserves a slot for a
  direction, so five outbound apps and no inbound is a valid account, and the refusal sentence
  names the shared total rather than pointing at a tab.
- The count lives in two places that must move together: the Postgres `owned_item_count`
  function (`20261111120000_owned_item_count_keeps_mcp_apps.sql` is its current shape) and its
  TypeScript twin (`backend/repositories/plans/usage-repository.ts`, the `mcp_connected_apps`
  branch). Both gain the outbound sum, and `plan_limits` moves 1 → 5 and 10 → 50 in a migration.
- The pricing page is part of this change, not a follow-up: `frontend/ui/plans/pricing-view.tsx`
  (`MCP_KEY`), the account plan card, `backend/loaders/plans.ts`'s label and
  `supabase/tests/plan_reads_test.sql` all quote the old 1 / 10 and the old "inbound only" wording.
  The new label must name both directions.
- **Calls.** A new `usage_limits` row, `mcp.call` («استدعاء تطبيق خارجي»), free 5 / pro 50 a day,
  decremented by every remote call — read or write — with `USAGE_COUNTERS` in
  `shared/contracts/plans.constants.ts` naming it so a typo is a type error. The seeded
  `mcp.tool.write` row stays unused for the reason it was never used: its label says "inbound
  write", and pointing the outbound path at it would make the pricing page lie.
- A write that never reaches the server — a card the member declines — spends nothing.
- Visitors get zero, as `VISITOR_ITEM_CAPS.mcp_connected_apps` already says: an external app has
  no visitor path.

## Surfaces

**The sheet** (`ServicesSheet`): one new row under the nine apps, «متجر التطبيقات», separated by
a divider and a section label so a stranger's app never reads as ours. Its words join
`shared/copy/shell-services.json` → `services-copy.ts` + `ServicesCopy.kt`; `Services.test.tsx`
and `ShellServices` fail until both clients draw it.

**The marketplace screen** (`/mcp/apps`): two tabs, with the tab carried in the URL (`?tab=`), so
a tab is still a shareable state and the back button still works.

- _تطبيقاتنا المتصلة بنا_ — the existing inbound grants list, rendered here rather than linked
  away. `/account/connected-apps` becomes a redirect to `?tab=inbound`, which is what keeps the
  account row, a bookmark and the app's screen table resolving.
- _تطبيقات نور_ — search over the verified store, the connect button, the connection cards with
  status, tool count, last used, and the permission level.

A row's title is the server's own name, in Latin: Notion is called Notion, and transliterating a
brand is a way to look wrong in two languages. What stays Arabic is everything around it — the
chrome, the states, the buttons — and the description, which shows the registry's English until
an admin fills `description_ar` for that row. No machine translation at ingest: a catalogue of
five hundred guessed Arabic paragraphs is worse than five hundred honest English ones.

**The post-connect screen** (`/mcp/apps/<id>`): name, what it can reach, every tool with its
switch, which ones write, and «افصل».

**States both clients declare**, per the house rule that a screen's states are the server's
answers: signed out, plan at cap, search empty, server unreachable, needs re-auth, token
expired mid-turn, tool list changed since connect.

Copy: `shared/copy/mcp-marketplace.json`, generated to both clients, `npm run copy:generate`.

## Native

The app's sheet gains the same row and the same section; the marketplace and connection screens
are ported from the same route, copy and states, with `docs/mobile/parity.json` and
`docs/mobile/screens.json` flipped in the same change. The port is switched on by `check:visual`
at 393 × 852 @ 2.75 like every other; until it passes, the document draws the surface. The
release note rides the same pull request (`npm run android:note`), in Arabic, for a user.

## Phases

1. **Foundation** — the six tables, the shared `mcp_connected_apps` count in Postgres and its
   TypeScript twin, the egress-policy client with its tests, discovery and DCR, the
   connect/callback flow proven against one real server. No UI. **Landed:** #1215, #1220, #1222.
2. **Catalog** — the mirror cron, search, the takedown screen (hide or block a row, with its
   reason — it is the one control a catalogue without an approval queue keeps), Arabic overrides.
   **#1223**
3. **Surfaces** — the sheet row, the marketplace screen, the post-connect screen, the inbound
   tab, the copy files. **#1224**
4. **Assistant** — remote tools in the registry, the router, `find_app_tools`, proposal
   mapping, permission levels, the turn budget. **#1225**, with the token refresh it depends on:
   **#1227**
5. **Metering** — the `mcp.call` row and its enforcement, the per-connection budget and the
   composer's meter. **#1226.** **Landed:** #1281.
   (The 5 / 50 numbers and the pricing page left this phase: they landed with the count, in
   `20261114150000`, because a pool of two directions at 1 / 10 is a cap nobody can use. #1222)
6. **Native** — the two screens, the sheet row, the parity rows, the visual gate. **#1228**
7. **Curation** — verification, the store query, featured order, brand marks, the icon proxy, and the
   Admin Console's approval. **ADR-0162.**

The two questions the plan could not settle in code are filed with their measurements: the
providers that refuse DCR (**#1229**) and the scopes a connection asks for (**#1230**).

## Risks

- **Prompt injection through a tool result.** The mitigation is structural (a result cannot
  grant itself permissions; writes always card), not a sentence in the prompt.
- **A stranger's bug becomes نور's answer.** A server that returns an error gets a tool error,
  logged with its connection id; the member sees «تعذّر الوصول إلى التطبيق».
- **Registry preview.** The docs say breaking changes and data resets are possible; the mirror
  upserts by `registry_name` and tolerates a row vanishing, so a reset is a re-fetch, not a
  migration.
- **Cost.** The router keeps per-turn payload O(relevant); the hard ceilings are 16 declarations,
  3 remote calls and the existing round cap.
- **Egress.** One module owns every outbound request, so the policy is one diff to review, and
  `security-review` must run on this change before it lands.
- **Curation is a human bottleneck, on purpose.** The store shows only what an admin verified; the
  registry's long tail stays in the Admin Console, searchable and one action from being approved.
  That is the trade the owner chose: a stranger's server is not one tap from a member's inbox. The
  compensating controls remain the probe, the takedown switch, and the permission levels.

## Settled, but provisional

The four questions this plan opened are answered above: `mcp.call` at free 5 / pro 50 counting
every call, brand names left in Latin with English descriptions until an admin fills one, the
free plan keeping the feature, and reads metered rather than riding the turn.

Two of those numbers are guesses about behaviour rather than facts about cost, and the first
measurement should settle them: 5 calls a day is roughly one app-using turn on free, and 5
connections across both directions is a pool a member with one agent and three apps drains
quickly. Both live in `plan_limits` and `usage_limits`, so changing them is a seed row, not a
design.
