# The Android app is a native Compose application

The APK stops being a WebView that loads the site. Every screen the app shows — the owned
products, the account pages, the auth flow, the public and server-guarded surfaces, `/admin` and
MCP — is drawn by Jetpack Compose, and the app reads the backend through a REST surface built over
the existing services. The website stays exactly what it is. The two are not the same
implementation of anything except the HTTP contract and the design tokens it is drawn from.

The WebView, Capacitor and the bundled document on `https://localhost` (ADR-0088) leave the APK.

This reverses a decision rather than correcting an oversight. ADR-0036 chose the remote-URL shell,
and ADR-0088 rejected "native Kotlin per screen" and "React Native now" in as many words. What
changed is that the cheaper option was built far enough to measure its ceiling: the two-origin spike
(#500) holds the document inside the APK and still boots Chromium to draw it, measured at 2.6 s to
commit and 4.1 s to the first mounted screen on the RMX3195. The owner has decided that ceiling is
the problem, not the network under it.

## What the shell costs today

All three numbers are measured, in [android-shell.md](../mobile/android-shell.md):

| Cost               | Measured                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cold launch        | commit 3.6–8.1 s after the process fork, median ~4.5 s over 12 launches; the document is 28 KB over 2.8–8.9 s of network                  |
| Warm launch        | 1.0–3.0 s after `onCreate` for the same document, because Capacitor destroys the WebView on detach and the next activity builds a new one |
| In-page navigation | 740 ms, 300 B — answered by the service worker                                                                                            |

A launch is always the WebView's first navigation, so it is never worker-controlled: every launch
measured reported `navigator.serviceWorker.controller === null`, even with the registration
`activated` and its Cache Storage intact. That is why the offline-first program (ADR-0027…0030)
protects a navigation after the app is up and cannot protect the app starting. Bundling moves the
network out of the launch and leaves the engine in it.

Native removes both terms. The launch is a process start and a first frame, and an owned row is the
device's row rather than a document describing it.

## The decision, in eight parts

1. **Kotlin and Compose own the UI.** A single activity, Compose navigation, Material 3 as the
   behavioural baseline, the repo's own tokens as the art direction. The shell's 24 Java classes are
   not a rewrite in place: the ones that already do native work (`QuranPlaybackService` and the
   media3 stack from ADR-0086, `ShellUpdate`, `ShellDownload`, `ShellInstaller`, `SyncMessagingService`,
   `SyncScheduler`) keep their job, and the bridge, plugin shims, launch skeleton and fallback page
   are deleted with Capacitor.

2. **Every surface is native**, not only the ones ADR-0088 bundles. That includes Community, News,
   rates, verify, `/u/<username>`, the marketing pages, `/admin` and MCP. The cost is stated rather
   than hidden: the APK, not a deploy, becomes the way those screens change (below).

3. **The web app stays, for the web.** Both implementations exist indefinitely. Every change to a
   screen is made twice, and the only machinery that holds them together is the contract and the
   token file — not a shared component tree, because there is not one.

4. **One HTTP contract, generated.** `shared/contracts` (Zod) remains the source of truth. Thin
   REST handlers sit over the existing `controller → service → repository` stack, auth resolves
   through `session-or-bearer-handler` (#501's seam), and Kotlin DTOs are generated from the Zod
   schemas at build time so a field rename fails the app's build instead of a device. No Supabase SDK
   on the device: the app is a client of this backend, not a second one.

5. **One token source.** The design system becomes a data file that emits both outputs: the CSS
   custom properties Tailwind already reads and a generated Compose theme (colour, type, spacing,
   radius, elevation). A hand-maintained Compose theme would drift, and drift would show up as "the
   app looks different" long after the cause.

6. **Room is the store, and the outbox is a specification.** The Kotlin outbox replays to the same
   server-side drain endpoints the service worker uses, so the server keeps one implementation. The
   rules that two engines can silently disagree about — identity partitioning, idempotency, order,
   retry and backoff, conflict resolution, what counts as drained — move into a language-neutral
   spec with shared JSON fixtures that both the TypeScript and Kotlin suites run. Sharing the code
   itself (KMP) was considered and rejected for now: it would rewrite a working, tested engine into
   Kotlin/JS and put a Gradle build inside the Next.js build to solve a drift problem a fixture
   suite catches more cheaply.

7. **Auth: password natively, providers through the browser.** A password grant mints the pair; the
   refresh token lives in Keystore-backed storage and the access token in memory. Google and the
   other providers complete in a Custom Tab and return on `royar://auth`, which is the app-link path
   the shell already has. There is no Supabase cookie jar in the app, and the app never depends on
   one.

8. **Direct APK stays the channel** (ADR-0044). No Play submission, so no review process to satisfy
   and no size ceiling to design against — and an in-place update for every release, which is now
   load-bearing: it is how remote content reaches an installed app.

## The seam: what replaces what

| Today (Capacitor)                                                | Native replacement                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `server.url` document + `unavailable.html` fallback              | Compose screens; no document, no fallback page                                  |
| `BridgeWebViewClient` commit listener, launch skeleton           | Splash theme into the first Compose frame (ADR-0061's sequence, natively)       |
| Capacitor plugins (filesystem, share, preferences, push)         | Framework APIs: `FileProvider`/`ShareCompat`, `SharedPreferences`, FCM          |
| `QuranPlayerPlugin` + media3 service                             | The service is already the implementation; its controller becomes Compose state |
| `ShellUpdate` / `ShellInstaller` / `latest.json`                 | Unchanged — it never needed the WebView                                         |
| `SyncFlushWorker` loading `/sync-flush.html` in a hidden WebView | Kotlin drain against the same endpoints, in the app process                     |
| Service worker + IndexedDB Local Store                           | Room + Kotlin outbox, held to the shared protocol fixtures                      |
| `window.Capacitor` bridge calls from UI                          | Typed repository calls; no bridge exists                                        |
| WebView floor and CSP (ADR-0067)                                 | Gone with the WebView — the app is one binary, not a renderer host              |

## Considered options

- **Keep ADR-0088's bundled half and finish #502/#503.** Rejected by the owner. It is the cheaper
  path and it is right for offline reads, but it keeps the engine in every launch and the skeleton is
  a cover for exactly that. Measured at 2.6 s to commit before any screen mounts.
- **Native for the owned surfaces, a Custom Tab for the rest.** This is the option I recommended and
  it is recorded here as rejected, not as unconsidered: it ports ~40% of the UI and keeps every
  server-rendered surface deployable. The owner's reason for rejecting it is product-shaped — the
  app is the product's mobile face, and a tab is not a screen.
- **React Native / Expo.** Rejected: it does not render natively, it forks the renderer, and the
  argument that motivates this decision (platform feel, Compose semantics, Material behaviour) is
  precisely what it does not provide.
- **Compose Multiplatform, or KMP for logic.** Rejected for now: the value is iOS, which is out of
  scope, and it puts Kotlin in the web build. The token and contract generators are the pieces that
  would be reused if iOS arrives.
- **Server-driven UI (JSON schema rendered by a native shell).** Rejected: a third UI language, the
  hardest to debug, and it makes the web and app disagree about layout by construction.
- **Native chrome only, WebView per screen.** Rejected: it keeps the two-origin split, the engine
  cost and the bridge, for the same kind of win a custom tab bar gives.

## Consequences

- **Two implementations, forever.** 28 surface rows (`docs/specs/surfaces.md`), 326 React components
  and 20 backend service areas are the scale of the second one. Contract changes are caught by
  generation; visual drift is caught by nothing but review, and that is a standing cost rather than a
  solved problem.
- **The APK is the content cadence.** A copy change, a rate table, a news item or a pricing page
  reaches installed apps only through a release and the in-place update. A web deploy no longer
  reaches the app at all. `versionCode` therefore carries every screen (ADR-0043's counter, already
  widened by ADR-0088).
- **`/admin` and MCP ship in a distributed binary.** Every route stays server-guarded, so this
  changes no authorization: it makes the operator UI readable by anyone who unpacks the APK. The
  rule that follows is that no admin capability may exist only in the client.
- **Two toolchains, one tree.** Gradle + Kotlin and Next.js + TypeScript, with the contract and token
  generators as the only bridge between them. CI grows a native job; the shell tests
  (`npm run android:test`) grow into the app's test suite.
- **The WebView-specific machinery stops describing the app**: the CSP's role, the service worker
  (ADR-0027…0030 stay for the web), the WebView floor (ADR-0067), the launch skeleton (ADR-0061),
  `bundledRootFor` and the back-button rule (ADR-0082), and the whole two-origin boundary of #500.
  `docs/mobile/android-shell.md` becomes the record of the shell that shipped until the update floor
  moved past it, not a runbook for what is being built.
- **The installed base does not move by itself.** ADR-0044's update path is the only way a device
  leaves the WebView shell. Until the floor is raised, the old shell has to keep working — which means
  keeping `android:minWebViewVersion`, the fallback page and the old API shape alive for a while
  after the new app exists.
- **One piece is already native and stays.** The recitation player (ADR-0085…0087) was forced out of
  the WebView before this decision; it is the proof that the native seam works in this app.

## What this ADR does not decide

- **iOS.** Nothing here is shared UI. If iOS is ever wanted, the KMP question reopens and the
  generators are the reusable part.
- **Whether the web app keeps a mobile layout.** Both stay; the surface matrix keeps describing the
  web, and its `Shell`/`Bundle` columns stop having a runtime to describe.
- **The REST shape per surface.** Only that it is REST over the existing services, generated from
  `shared/contracts`, and that behaviour stays in the services rather than in the handlers.

Order of work, phase exits and the budgets that decide them:
[native-app.md](../mobile/native-app.md).
