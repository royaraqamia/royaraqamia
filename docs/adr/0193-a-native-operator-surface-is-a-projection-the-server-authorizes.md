# 0193. A native operator surface is a projection the server authorizes

## Status

Accepted (the review for #660, recorded on #971). The two implementation slices are #973 (MCP
connected apps, consent and revoke) and #974 (the admin console in the app).

This ADR adds no capability. It applies ADR-0089's consequence — "no admin capability may exist
only in the client" — and ADR-0180's decision 10 — "Admin is a scope checked at execution, not a
prompt line" — to the surfaces the APK draws, and says which of them may cross into Kotlin.

## Context

Phase 4 of [native-app.md](../mobile/native-app.md) ports `/admin` and MCP last, and both wait on a
security review: the APK is a distributed binary, so its operator UI is readable by anyone who
unpacks it. The rule that has to exist before a screen is drawn is what may be in the client at all,
not how it looks.

The app already draws the member's MCP surfaces: `/account/connected-apps` is
`ConnectedAppsScreen.kt`, `/mcp/apps/[id]` is `ConnectionScreen.kt`, and the marketplace's
pre-flight ask is `ConsentDialog` in `MarketplaceTab.kt`. It does not draw the console:
`AccountRows.kt` has an admin row, but `ShellActivity.kt` passes `isAdmin = false` while this review
is open, so the row is never reached.

The question is not whether the app may call the server — it calls every product route with the
member's bearer — but which operator surfaces may exist in the client.

## What the review found

1. **The server already owns the decision, per request.** Every admin data route is behind
   `withAdminUser` (`backend/transport/admin-handler.ts`), which resolves the caller through the
   identity seam and answers anonymous with `401` and a signed-in non-admin with `403`. LinkSnap's
   two admin routes are the one other shape: `requireUser` plus an `isAdmin` check inside
   `moderate-link.ts` and `get-system-stats.ts`. Both re-read the session; neither trusts a claim
   from the client. `resolveAdmin` accepts the cookie or a bearer token, and a bearer header is
   authoritative, so a native call is authorized exactly as the page's call is. A native console
   therefore adds no authority. The service-role `/api/admin/sync-allowlist` route is the exception
   that proves it: it is a machine credential, not an admin session, and it is not a console action.
2. **The client never receives the allowlist.** `GET /api/me` answers `isAdmin: boolean`;
   `ADMIN_EMAILS` stays in the deployment and its database mirror is derived (ADR-0003). The APK can
   know "this account is an admin" and nothing more.
3. **The console's writes are not one class.** Read queues, reversible moderation and one-way
   actions share one navigation. Drawing them uniformly would put an irreversible control one tap
   inside a binary anyone can unpack.
4. **There is no "native admin" route.** The console calls the same routes the page calls. Nothing
   needs inventing; the existing `withAdminUser` is the boundary.
5. **The inbound MCP consent is browser-shaped by contract.** `POST /mcp/connect/consent` validates
   the registered client, the redirect URI, PKCE (`S256`), the requested scopes, a per-IP rate limit
   and a **same-origin** CSRF guard, then mints an authorization code over a dedicated session
   (`bridge-session.ts`, ADR-0023) and redirects to the client's own `redirect_uri`. A native POST
   has no browser `Origin`; a native screen would need a second consent route with its own CSRF
   story, and the external client's redirect is a web address, not the app. It has no door either:
   the external client opens the page in a browser, and nothing in the app links to it. That is a
   new security surface for a flow the member reaches from a browser.
6. **The member-facing MCP surfaces are not operator surfaces.** The connected-apps list is a
   token-scoped read plus revokes the server authorizes; the marketplace dialog only announces the
   provider's page before the server starts the connection. Both already obey the rule.
7. **An admin surface must publish no snapshot.** ADR-0181 decision 8 suppresses the screen
   snapshot while an admin surface is open, so another member's row cannot ride into an assistant
   prompt. A native console keeps that opt-out; it is a precondition, not a nicety.

## Decision

**An operator surface may exist in the APK only as a projection over an existing server route,
authorized per request. The APK holds no allowlist, and no client gate adds authority.**

1. **Reads may be drawn natively.** A read calls the same route the page calls, with the member's
   bearer; the server decides admin and returns only what the admin may see.
2. **Reversible or internal moderation may be drawn natively, with a confirmation that names the
   target.** The action must be a single decision on an existing route; it must not move money, send
   a message, publish to strangers or delete a row. It either is undoable from the same screen or
   changes no member-visible state — an internal queue status is still a decision, but it is not an
   effect on anybody.
3. **One-way, money, public-copy and deletion stay the web page.** A second control for these in a
   distributed binary is a second way to make a mistake, and none of them gains an offline or device
   capability.
4. **The admin row comes from `GET /api/me`'s `isAdmin`.** No email comparison in Kotlin, no list of
   admins in the APK, no local decision the server would not repeat. The row's absence for a
   non-admin is convenience; every call is still refused by the handler.
5. **No admin capability exists only in the client, and no native-only admin route is added.** A
   screen that needs a route the web does not have does not get one; it stays the page.
6. **An admin screen is online-only and leaves no trace on the device.** Its response stays in
   memory for the screen; it does not enter the Local Store, the outbox or the public snapshot cache,
   and it is not drawn from a last-seen copy.
7. **An admin screen publishes no snapshot** (ADR-0181 decision 8), because the surface's own data
   is another member's business.
8. **The inbound MCP consent stays the document.** `/mcp/connect` is not drawn: it has no door from
   the app, and its POST is browser-shaped. The consent that may be native is the marketplace's own
   pre-flight dialog, already in `MarketplaceTab.kt`; #973 confirms the list/revoke pair and adds no
   second consent route.
9. **Machine surfaces are never client controls.** `/api/admin/sync-allowlist` is a service-role
   credential and the downloader admin routes are the scheduled fetcher's; neither is an operator
   action and neither is drawn.

### The list

**May be drawn natively — reads (tier 0):**

| Surface                                                              | What it reads                                |
| -------------------------------------------------------------------- | -------------------------------------------- |
| `/admin`                                                             | the console's section index                  |
| `/admin/reports`                                                     | the chat-report queue and its frozen excerpt |
| `/admin/news`                                                        | the source-request queue                     |
| `/admin/plans`, `/admin/plans/requests`                              | plan users, usage and activation requests    |
| `/admin/training/cohorts`, `/admin/training/applications`            | cohorts and applications                     |
| `/admin/consultations/bookings`, `/admin/consultations/availability` | bookings and open slots                      |
| `/admin/clients/project-requests`, `/admin/clients/retainers`        | the two client-work queues                   |
| `/admin/linksnap`                                                    | the platform's own statistics                |
| `/admin/mcp/marketplace`                                             | catalog rows                                 |
| `/admin/certificates`                                                | the certificate list                         |
| `GET /api/admin/users`                                               | the lookup the queues use, not a screen      |

**May be drawn natively — reversible or internal moderation (tier 2), each confirmed by naming its target:**

| Action                                                  | Route                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| mark a chat report reviewed/dismissed                   | `PATCH /api/admin/chat-reports/[id]`                             |
| update a training application, enroll or release a seat | `PATCH /api/training/applications/[id]`, `…/enroll`, `…/release` |
| update a project request                                | `PATCH /api/project-requests/[id]`                               |
| update a retainer                                       | `PATCH /api/retainers/[id]`                                      |
| block or unblock a short link                           | `POST /linksnap/api/admin/moderate`                              |

**Stay the web page:**

| Action                                                                                                    | Why                                                                       |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| issue, edit or delete a certificate (`/admin/certificates/**`)                                            | a public artifact a stranger verifies; deletion cannot be taken back      |
| broadcast or announce (`/admin/announcements`)                                                            | one-way, reaches every member                                             |
| activate a paid plan (`POST /api/admin/plans/activate`)                                                   | money                                                                     |
| booking action, slot create/delete, package create/update/delete, settings (`/api/consultation/admin/**`) | money and public prices, and a slot deletion can orphan a booking         |
| create or update a cohort (`/api/admin/training/cohorts`)                                                 | the enrollment window and capacity applicants are measured against        |
| publish, suspend, probe or translate a catalog row (`/api/admin/mcp/catalog*`)                            | public catalog copy and third-party apps                                  |
| approve or reject a news source                                                                           | changes what every member reads, and writes the feed the daily fetch uses |
| `POST /api/admin/sync-allowlist`, the downloader admin routes                                             | machine credentials, not operator actions                                 |

## Consequences

- `docs/mobile/parity-plan.json` moves `admin` from `blocked` on #971 to `todo` on #974, and the
  phase's reason now points here. `npm run check:plan -- --write` regenerates the rendered plan.
- `docs/mobile/screens.json`'s admin row states the decision; `npm run check:screens -- --write`
  regenerates the Markdown.
- `/mcp/connect` stays `document`, with the consent route as its reason rather than the snippet.
- #974 reads `isAdmin` from `/api/me`, draws only the rows above, confirms every allowed write by
  naming its target, keeps admin data out of the device stores, and registers the admin surface with
  the snapshot opt-out.
- #973 adds no inbound-consent screen; it confirms the connected-apps list/revoke and the existing
  marketplace dialog.
- **The APK still ships the console's shapes.** Anyone who unpacks it can read the labels, fields and
  empty states of the admin UI. The data still requires the admin's own token, and every call is
  refused without one. That is the accepted cost, and it is the same cost ADR-0089 already recorded
  for `/admin` and MCP.
- A write in the web-only table that later needs to be native takes a new ADR, not a screen.

## Alternatives rejected

- **Draw the whole console.** One navigation, one port, and an irreversible control inside a binary
  anyone can unpack. The web page already has the flow, its confirmation and its audit; the app adds
  no capability and takes on the blast radius.
- **Draw nothing and leave `/admin` the document.** Safe, but the console's reads are the same
  server-authorized projections the app already draws elsewhere, and a read has no blast radius. It
  would keep an admin on the document for work a phone can do.
- **A native admin API.** A second authorization surface in the one place a second surface is most
  expensive. The existing `withAdminUser` route is the boundary.
- **A native inbound-consent screen.** It needs a second consent route without the browser's
  same-origin check, for a flow an external client opens in a browser.
- **Gate the admin row by comparing the member's email in Kotlin.** The allowlist would ship in the
  APK and the client's answer would be the one that matters. The server already answers the same
  question.

## What this does not decide

- **The look of the admin screens.** ADR-0117 and ADR-0118 decide when a port is the same screen as
  the page; this ADR only says which screens may be attempted.
- **The console's navigation shape** — a sheet, a tab or a route — which belongs to the slice that
  draws it.
- **The downloader's operator surface.** It is a machine surface today; a human page would reopen
  this review.
