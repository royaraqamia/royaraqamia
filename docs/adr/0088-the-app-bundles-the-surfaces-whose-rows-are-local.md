# The app bundles the surfaces whose rows are local

The Android app was a Capacitor **remote-URL shell**: the WebView loaded
`https://royaraqamia.com` and the site stayed the single implementation of every surface
(ADR-0036). That shape has a floor no cache can move — a document the shell never downloaded cannot
be rendered offline — and the products whose rows already live in the Local Store were paying it for
nothing. The spike in #500 built the alternative and measured it: one APK holding a bundled document
on `https://localhost/` next to the live origin, with a real product surface and both ways of
crossing between them.

This ADR records the decision that follows: **the app bundles its owned surfaces, the web stays the
server-rendered surface, and the two are reached through a stated boundary.**

## The route split

The split is by **data owner**, not by preference. A surface whose rows live in the Local Store must
ship with the app to be offline at all; a surface whose guard, content or fan-out answers on the
server gains nothing from being bundled and loses its single implementation if it is.

| Route                                           | Where it lives | Why                                                                                                                                                                                                     |
| ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HabitFlow, SpendTrack, LinkSnap, BlogPress      | bundled        | Local Store products: the rows are already on the device, so the document belongs there too                                                                                                             |
| Quran (text)                                    | bundled        | Identity-partitioned and already vendored (`public/quran`); a reader offline is the product. Audio stays a network asset behind the immutable cache (ADR-0062) — a stated limit, not full offline audio |
| `/device`                                       | bundled        | Reads the shell's own state; a server round trip to describe the APK is noise                                                                                                                           |
| Auth                                            | bundled        | The app has to hold its own credential (below); a sign-in page that needs the origin it is authenticating for cannot work                                                                               |
| Community, News, rates, verify, `/u/<username>` | remote         | Server-guarded, shared or fan-out content: another user's rows are not this device's to keep                                                                                                            |
| Marketing pages, `/admin`, MCP                  | remote         | Server-rendered by definition, or an operator surface that must never be packaged                                                                                                                       |

## The origin split, and the seam between them

The bundled document is served by the shell from the APK (`https://localhost/`); the live site stays
`https://royaraqamia.com`. `server.url` is unset in the bundled target — that single line is what
makes a document ship at all — and the remote surfaces are reached **deliberately**, through a Custom
Tab (`@capacitor/browser`), not by navigating the same WebView.

That choice is measured, not aesthetic. In the same WebView a crossing to the live origin lands fine
but leaves `history.length === 1` on the remote document, so `canGoBack()` is false and Back finishes
the activity from a page the user expects to return from. `MainActivity.bundledRootFor` can keep the
user in the app, and does (#637), but it pays the whole document: no scroll position, no state. A
Custom Tab leaves the app's WebView untouched on the bundled document and dismisses back into it,
which is the behaviour the split needs.

Known and stated, because the alternative is discovering it later:

- **The WebView restores the last document across an activity restart.** Leave the app on the site and
  reopen it and it comes back to the site, not the bundled root. The bundled target has to clear or
  map that restore.
- **The transport reads the WebView's cookie jar.** The spike's probes answered `200` for an
  owned-data read with the site's cookies in the jar and `401` after clearing it, on the same token:
  `CapacitorHttp` is native HTTP, so it is not subject to `SameSite` and carries cookies the page
  itself could never send. The auth seam below is therefore about what the app _presents_, not what
  it _forwards_.
- **A provider-only account has no Bearer path.** The spike's panel mints a token with a password
  grant; an account that signs in with Google cannot. Sessions for those users are either cookie-based
  or minted by a flow the shell completes itself — that is #501's decision, and it is the one thing
  here that is still open.

## The auth seam

Bearer in the app, cookies on the web: the app sends `Authorization: Bearer` for its own reads, and
the server resolves either credential through `session-or-bearer-handler`. The cookie jar belongs to
the browser's document; the app's session has to survive it not existing. **No cookie is shared
across the boundary by design** — and, from the finding above, none is assumed absent either: a
bundled read must be authorized by the token it sent, not by whatever the jar happens to hold, or the
boundary is decorative. Owned-data routes need a token-scoped client before any bundled surface
relies on them (#501).

## The cadence consequence

`versionCode` now carries the UI, not only the shell's own code (ADR-0043). A web deploy updates the
remote surfaces as it always did; a bundled surface changes only when a new APK is installed, which is
ADR-0044's in-place update path and #503's channel. The tax that buys: **two build targets, one tree**,
with #502's CI gate keeping the bundled target honest — a surface that stops building for the APK is a
release that would have shipped stale.

## Why B, rather than a measured candidate

Speed can only quantify B, not justify it: a remote-URL shell cannot render a document it never
downloaded, so the offline floor for owned data is architectural. No cache tuning, no worker strategy
and no WebView setting changes that — which is why the spike (#500) was scoped as a correctness test
of the origin boundary, with its numbers as regression baselines rather than a gate.

## Considered options

- **Keep the remote-URL shell and improve its cache.** Rejected: it cannot serve a first offline open
  for an owned route, and the launch is a network round trip that no pre-warm recovered (#499's
  pre-warm measured inside the noise and was dropped).
- **One origin for both halves — bundle everything, or reflect the site into the APK.** Rejected:
  bundling Community, admin and MCP means packaging other people's rows and an operator surface;
  reflecting the site needs a server the app can reach, which is the offline case it is trying to fix.
- **Same-WebView crossings for remote surfaces.** Rejected on the measured behaviour above: no
  history entry, and the state loss is the user's.
- **Native Kotlin per screen.** Rejected: two implementations of every surface, in two languages, with
  the design system drifting between them.
- **React Native now.** Rejected: a rewrite of every view before the ceiling of the cheaper option is
  known.
- **Do nothing.** Rejected: the ceiling is measured (ADR-0075's timings), and the products whose rows
  are local are the ones paying for it.

## Consequences

- ADR-0036's "the shell loads the live site" is now one of two shapes; ADR-0043's counter carries the
  UI; ADR-0061's skeleton hands over into a bundled document; ADR-0071's precache stays the remote
  surfaces' mechanism and stops being the owned ones'.
- Two build targets in one tree, gated by #502, and an update channel that carries UI (#503).
- The boundary is visible in the product: leaving for a remote surface is a tab, not a navigation, and
  coming back is the app exactly as it was.
- The app's own kinds of failure become distinguishable — a bundled route is stale only when
  `versionCode` says so, never because a cache header disagreed (ADR-0071's naming rule no longer
  applies to it).
