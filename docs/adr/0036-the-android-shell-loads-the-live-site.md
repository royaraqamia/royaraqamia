# The Android shell loads the live site

The Android app is a Capacitor **remote-URL shell**: the WebView loads
`https://royaraqamia.com` (Capacitor's `server.url`), and the site stays the single
implementation of every product surface. Nothing is statically exported, and no page is
bundled into the APK.

## Why not bundle the web assets

The alternative — ship a `next export` output as the app's assets — cannot represent this
app. Every surface is server-rendered, several use Server Actions, and authentication is
Supabase cookies managed by `@supabase/ssr` on the server. A static export would drop all
of it.

It would also move the app onto a `https://localhost` (or `capacitor://localhost`) origin,
and three existing decisions are written against `self`:

- the CSP is `default-src 'self'` with `connect-src` naming `api.royaraqamia.com` and
  `*.supabase.co` explicitly,
- `@supabase/ssr` cookies are scoped to the site's own origin,
- the offline-first posture (ADR-0027…0030) is built on a service worker registered for
  the site's origin, with an IndexedDB Local Store already per-identity.

Bundling would mean re-deriving all three for a second origin, to ship a worse version of
a site the device can already reach.

## Considered options

- **Bundle a static export of the whole site.** Rejected: impossible without abandoning
  server rendering and Server Actions, and would fork the CSP, the cookie jar and the
  offline story onto a second origin.
- **Hybrid: bundle the shell, load dynamic pages remotely.** Rejected for now: it splits
  one origin into two, which is the same origin problem in a smaller, harder-to-reason
  form. Worth revisiting if startup latency on a cold, slow connection ever becomes the
  complaint.
- **Capacitor Live Updates (OTA bundles).** Rejected: it is the right answer for a bundled
  app, but it presumes a bundled app. It also buys what `server.url` already gives us for
  free — no rebuild to change the site — while adding an update service, code signing and
  native-version channels to maintain.
- **A native app that calls the API directly.** Rejected: it would reimplement
  certificates, community, consultations, training and the admin console a second time,
  in a second language, for one platform.

## Consequences

The app is a **network-dependent shell**. No connection at launch means no content; the
only offline behaviour is whatever the service worker already caches inside the WebView.
It also means the site and the app can never disagree about behaviour, and a deploy reaches
every installed app immediately — the trade this decision is buying.

**Store review is the cost.** An app whose content arrives entirely from a server is a
gray area for reviewers (the same shape that Apple's guidelines single out and that
Capacitor's own maintainers describe as not-for-production). Distributing the APK directly
avoids the question; a Play submission should not assume it will pass on this
architecture alone.

**The native bridge is bound to one origin.** Capacitor injects `window.Capacitor` for the
configured app URL only — via `addDocumentStartJavaScript` on WebView 86+, or by injecting
into the document `WebViewLocalServer` serves on older ones
(`Bridge.java:267-269`, `WebViewLocalServer.java:210` in `@capacitor/android` 8.5.3). So
`Capacitor.isNativePlatform()` is true on `royaraqamia.com` and would be false on a
subdomain, which is proxied rather than served. Measured true on WebView 83, so field
devices are not the constraint. `frontend/shared/native-shell.ts` reads the bridge
defensively and falls back to web behaviour, so a missing bridge degrades instead of
breaking. See
[ionic-team/capacitor#7454](https://github.com/ionic-team/capacitor/issues/7454).

**The app is a second surface to keep honest.** Anything the shell adds natively — deep
links, an OAuth return trip, FCM — has a web counterpart that must keep working, and the
two must not drift. `docs/mobile/android-shell.md` is the runbook and lists what is still
open.

## Amendment (2026-10-21, #447): a warm cache answers the launch, and a failed one recovers

The consequence above — "No connection at launch means no content" — describes a launch with no cache
at all, which is now one case among several. Phase 0 of the offline-first roadmap changed the two that
were wrong:

- **A launch with a warm cache serves the worker's shell.** The remote URL is still requested first
  (that is this ADR's decision), but the service worker answers it from the cached document when the
  network fails or misses the ten-second navigation deadline (`public/sw.js`, #447), so the app paints
  the site it already has. The WebView start plus a first frame is still a real cost; it is no longer a
  content cost.
- **A failed first frame recovers once on reconnect.** `capacitor-web/unavailable.html` arms a single
  reload on the first `online` event, guarded by a session flag
  ([ADR-0067 amendment](0067-the-shell-has-a-floor-and-a-local-page.md)). A site still down after that
  reload gets the retry-by-tap card only, so the anti-loop guarantee stands.

What does not change: a brand-new install with no network still has no document, and the cold-start
floor remains the WebView start plus a first frame, recorded in the limits of
[`docs/specs/offline-first.md`](../specs/offline-first.md). This ADR's decision (load the live site)
is untouched; its consequence paragraph was one state too absolute.
