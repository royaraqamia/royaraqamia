# The native app: order of work

[ADR-0089](../adr/0089-the-android-app-is-native.md) is the decision. This is the order it is
executed in, what each phase has to prove before the next one starts, and what it retires.

The shape of the risk is front-loaded twice. Phase 0 is the seam — contract generation, tokens,
session, storage — and if it is wrong, every later phase pays for it. Phase 5 is the cutover, where
the old shell and the new app have to coexist on the same update channel. The middle phases are
volume: repetitive, parallel, and the part that is easiest to under-estimate.

## Budgets

These are the numbers a phase exit is measured against, on a real device rather than an emulator.
They replace the shell's, which are in [android-shell.md](android-shell.md) and stay there as the
baseline being beaten.

| Measure                                | Budget                      | Today (shell)                                                                 |
| -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Cold start, process dead → first frame | 400 ms                      | 3.6–8.1 s to document commit                                                  |
| Warm start, activity recreated → frame | 300 ms                      | 1.0–3.0 s                                                                     |
| Tap → painted frame                    | 100 ms                      | `perf/paint-budget.json` rows                                                 |
| Offline write → drained                | 5 s after the radio returns | not possible for owned rows at launch                                         |
| Release APK (universal)                | 20 MiB                      | 11.4 MiB, minified ([ADR-0094](../adr/0094-the-release-build-is-minified.md)) |
| Scroll, 60 fps list of 500 rows        | no dropped frame > 2        | not measured                                                                  |

## Phase 0 — the seam

No product UI. This phase exists to make everything after it mechanical.

- **Module layout.** `android/app` stays the application id and signing identity. Kotlin source
  moves to `android/app/src/main/kotlin`; the Java classes that survive are converted as they are
  touched, not in one pass. Compose BOM, Kotlin and AGP versions are pinned in
  `android/variables.gradle`, where the Capacitor versions live today.
- **Networking and DI.** One HTTP client, one serializer, one error model (`ApiError` carrying the
  server's own code), one session object. Hilt or manual wiring is a phase-0 choice — decide it
  once, with the reason recorded, rather than per feature.
- **Session.** Refresh token in Keystore-backed storage, access token in memory, single-flight
  refresh, and a 401 that re-authenticates once and never loops. The provider path is a Custom Tab
  plus the `royar://auth` return the manifest already handles.
- **Contract generation.** `shared/contracts` → Kotlin data classes, enum and sealed types, run by a
  script and checked in CI: regenerate and fail if the tree changes. A field removed from a Zod
  schema has to break the Kotlin build.
- **Tokens.** A single token file (colour, type scale, spacing, radii, the two font families) that
  emits the web's CSS custom properties and a Compose `Theme`. `npm run check:design-tokens` fails
  when an output is stale. Aref Ruqaa stays the digits face and is never applied to a field.
- **Outbox protocol.** The spec plus fixtures: ordering, idempotency key, retry and backoff,
  conflict resolution, what "drained" means, what identity partitioning means. Both the TS suite and
  the Kotlin suite run the same JSON.

**Exit criteria.** A Compose screen on a device reads one authorized endpoint; the refresh survives
a process kill; deleting a field from a Zod schema fails the build; changing a token changes both
outputs; the fixtures run green in both languages.

**Wired today (#648).** `npm run contracts:generate` writes
`android/app/src/main/kotlin/com/royaraqamia/app/contracts/generated/` from the schemas named in
`scripts/generate-contracts.mjs`, and `npm run check:contracts` fails CI when the committed output is
stale. Decoding goes through `ContractCodec`, which returns `ApiResult`: a body that does not match
the contract is `ApiError.InvalidContract` naming the field, not an exception on a background
thread. The Kotlin Gradle plugin is pinned in `android/build.gradle` rather than `variables.gradle`,
because a buildscript classpath is resolved before that file is applied.

**Wired today (#647).** Compose is a dependency of the app module: the BOM is pinned in
`android/variables.gradle`, the compiler plugin sits beside the Kotlin plugin in
`android/build.gradle`, and `android/app/src/main/kotlin/com/royaraqamia/app/theme/` holds the theme
the tokens generate - colour, type, spacing and shape, in the two faces the APK already bundles.
`npm run tokens:generate` writes `ThemeColors.kt` alongside `DesignTokens.kt`, so a colour the theme
can name is a colour the tokens have. The release build is minified for the same reason the theme
exists ([ADR-0094](../adr/0094-the-release-build-is-minified.md)). `plans/PlanCard.kt` draws the
`/account/plan` page's two sections from the page's own route (`GET /api/me/plan`): the card - rows in
the digits face, labels in the UI face - and the activation history, each payment with its amount, its
method, its Hijri dates and its note. It is a listed pair in `docs/mobile/parity.json`: the words come
from `shared/copy/plan-card.json` through `npm run copy:generate`, and `npm run check:parity` fails a
state, a string or a route that exists on one side only ([ADR-0098](../adr/0098-a-ported-component-is-a-pair.md)).
`src/debug` holds the workbench activity that shows it, reachable only in a debug build and reading a
project URL from this machine's `android/local.properties`; a release APK contains neither
(`scripts/__tests__/native-workbench.test.mjs`). The screen arrived with #657: `plans/PlanScreen.kt` is `/account/plan` — the page's title from the same
copy source, the card under it, reading the page's own route when a session answers and drawing the
card's guest prompt when none does. The shell lists the route in `shell/NativeSurfaces.kt`, so it draws
the screen instead of handing the route over.

**Wired today (#657).** `connectedapps/ConnectedAppsCard.kt` draws `/account/connected-apps`'s list
from the page's own two routes — `GET /api/me/mcp/connected-apps`, and the `DELETE` that revokes one
client or every client: the four states the view draws, the empty prompt, the destructive tint on a
revoke and the question asked before it. It is a listed pair in `docs/mobile/parity.json`: the words
come from `shared/copy/account-connected-apps.json` through `npm run copy:generate`, the glyphs from
`shared/icons/icons.json` through `vectors:generate`, and the relative time is this surface's own
sentence over the shared `timeAgoParts` rather than a second copy of the thresholds
([ADR-0104](../adr/0104-a-shared-formatter-returns-parts-not-sentences.md)). A revoke is a request,
never a local filter — the card re-reads the list from the server, so a revocation that
half-succeeded cannot look complete — and `AppGraph` wires the repository the workbench draws beside
the plan card. The screen arrived in the same slice: `connectedapps/ConnectedAppsScreen.kt` is
`/account/connected-apps` — the page's title from the same copy source, the card under it, a revoke
that keeps the server's own refusal without re-reading, and a successful one that re-reads the list
rather than dropping the row. The account area's remaining pages are each owned by the ticket that
draws the component they are made of: the account screen itself (profile and sign-out) is
[#798](https://github.com/royaraqamia/royaraqamia/issues/798), the FAQ, the news preferences and the
changelog are [#799](https://github.com/royaraqamia/royaraqamia/issues/799), the owned posts list is
the community feed's post card ([#658](https://github.com/royaraqamia/royaraqamia/issues/658)), the
short links are LinkSnap ([#654](https://github.com/royaraqamia/royaraqamia/issues/654)) and the
submissions page is the request and booking forms
([#659](https://github.com/royaraqamia/royaraqamia/issues/659)).

The account area's pages are one row each in `perf/surfaces.json` — `account`, `account-plan`,
`account-connected-apps`, `account-faq`, `account-news`, `account-links`, `account-posts`,
`account-submissions` — rather than the two rows (`account-owned`, `account-server`) that held four
routes apiece. That is what lets `docs/mobile/screens.json` answer per page: a surface is native only
when all of its routes are, and a row that grouped four different pages forced one answer for four
different ports.

**Wired today (#647, the shell).** `shell/ShellActivity` is the launcher: the splash theme hands over
to a Compose frame drawn from the tokens, RTL at the root, with the app's own tab bar
(`shell/ShellTabBar.kt` — the site's three primary routes, its labels through
`shared/copy/shell-tab-bar.json` and its glyphs through `shared/icons/icons.json`, listed as a pair in
`docs/mobile/parity.json`). The splash's background is the generated `roy_background` — the token
`ShellFrame` paints — so the platform splash lifts onto that frame with no colour change. The release
APK also carries the shell's own baseline profile
(`android/app/src/release/generated/baselineProfiles/baseline-prof.txt`, regenerated by
`npm run android:profile` on the managed emulator, #762): the Compose libraries' profiles were in the
APK already, and this one adds the app's own startup path so a device's background dexopt compiles it
before a user opens the app. The route model is the site's own grammar (`shell/Routes.kt`,
`shell/DeepLink.kt`, `shell/ShellBackStack.kt`) and is unit-tested rather than asserted, including the
back rule ADR-0082 states: only home closes the app. A destination whose surface is still the
document hands the route over (`shell/WebSurface.kt`) and the shell stays underneath it, so back from
a web surface lands on the app's own frame — [ADR-0105](../adr/0105-the-shell-launches-and-the-document-is-a-destination.md)
records that interim and the criterion it leaves to #662. `shell/NativeSurfaces.kt` is the empty set
that decides which routes are drawn instead of handed over; a surface's port is what puts a route in
it.

The top bar and the `خدماتنا` menu landed with it (#647): `shell/ShellTopBar.kt` draws the mark and the
pill, `shell/ShellServices.kt` the sheet and its sixteen rows — the site's order, the site's words in
`shared/copy/shell-services.json`, the site's glyphs through `vectors:generate`, and a parity row whose
states are the trigger and the rows. The menu's table moved out of `frontend/ui/app-shell/constants.ts`
into `frontend/ui/navbar/services-link.ts` in the same change, because the generated copy is now its
only source of words. Still owed from this slice: the cold and warm starts measured on a mid-range
device (`npm run android:launch`, [#752](https://github.com/royaraqamia/royaraqamia/issues/752)), the
320 dp run, and the two chrome gaps [two-clients.md](two-clients.md) lists.

**Wired today (#501).** `Session` keeps the access token in memory and the refresh token sealed at rest
(`EncryptedTokenStore` over a Keystore key), refreshes once however many requests are answered 401 at
the same moment, and ends the session only when the server _refuses_ the token — a refresh that never
reached an answer keeps it, because a tunnel is not a sign-out. `ApiClient` sends that bearer to an
owned route, allows one refresh and one retry, and decodes through the contract; `HttpTransport` is
the one place a socket exists, with its timeouts. `SupabasePasswordGrant` is the password half of
sign-in, and `AppGraph` is the composition root that wires storage, session, client and repository
together. Still owed: the provider return on `royar://auth`, the identity partition a sign-out
performs (ADR-0070), and the Keystore path itself — it cannot run in a unit test, so it is verified
on a device.

**Retires:** nothing. This phase is additive.

**Wired today (#768).** HabitFlow's Local Store is the app's own: one database per identity
(`habitflow__guest.db`, `habitflow__user%3A<id>.db` — the web's partition with the file's
extension), Room entities for habits and logs, and a pull that writes the
`GET /habitflow/api/sync` snapshot in one transaction
([ADR-0107](../adr/0107-the-habit-store-is-one-database-per-identity.md)). The identity is
remembered on disk and read at construction, so a cold launch with the radio off opens the right
store and paints instead of waiting for a refresh: `HabitflowRepository.rows()` answers from the
database alone, and `pull()` is the only writer. `HabitSyncResponseSchema` joined
`scripts/generate-contracts.mjs`'s `CONTRACTS`, because the read models in
`shared/contracts/habitflow.ts` were TypeScript interfaces the app could not decode. The
partition is asserted by one fixture read by both suites
(`shared/fixtures/local-store/identity.json`: the web's `identity.ts` and the app's `Identity`),
the DAO's tests run on the JVM against real SQLite files under Robolectric, and the exported
schema is committed so a version bumped with no migration is a review finding rather than a
device's lost rows. The screen followed in #649 and the outbox with the
pending-aware merge in #650. Still owed here: a sign-in that Claims a guest's rows
— the guest store exists and is empty until a guest can write.

**Wired today (#650).** HabitFlow writes: a tap commits the log **and** its replay
intent in one transaction (`HabitDao.commitLog`), so the row is durable before any
request is made. The Outbox is a table in that identity's own database, replayed by
`OutboxDrainer` to the endpoints the web's outbox already drains to
(`frontend/api/habitflow/sync-transport.ts`), so the server keeps one
implementation ([ADR-0109](../adr/0109-a-queued-write-is-a-row-and-an-intent-in-one-transaction.md)).
The rules two engines could silently disagree about — replay order, backoff, the
permanent/transient split, what "drained" means, which request each intent becomes,
and who wins a conflict — are `shared/fixtures/offline-writes/habitflow.json`, run
by the web suite and by the app's `OutboxFixturesTest`. The pull is pending-aware, so
a queued write is not clobbered by a snapshot, and the sync pill grew the site's
pending and failed states — the failed one a retry. `npm run android:outbox-drill`
is the device proof: sign in, cut the radio, queue a write, force-stop the process,
restore the radio, and read the row back from the server inside the five-second
budget. Still owed here: the add form and the delete affordance (the store, the
transport and the fixtures cover create, update, toggle and delete; the screen
exposes the toggle), delivery with the app closed (#651), and a guest claim on
sign-in.

## Phase 1 — the HabitFlow slice

The smallest complete vertical: screen, session, API, Room, outbox, drain.

- Room entities and DAO for habits, the outbox table, and the drain that replays to the existing
  endpoint — the same contract the service worker drains to.
- List, add, toggle, delete, with the optimistic write painted before the network answers, and the
  failure state a user can retry.
- A `native:drill` script that does what `scripts/shell-drill.mjs` does: kill the process with a
  write queued, restore the radio, and assert the row lands on the server.

**Exit criteria.** All six budgets on one device, one run each; an offline add drains after the
process was killed; the drill runs from a clean checkout in one command.

**Retires:** nothing. The bundled HabitFlow document (#500's spike) is deleted with Capacitor in
phase 5; until then the web app is the reference the slice is compared against.

## Phase 2 — the shell

Navigation, the tab bar, RTL, theming, back, deep links, updates, push, diagnostics.

- Navigation Compose with the three primary destinations and the `خدماتنا` menu's secondary entries
  (#277), RTL forced at the root, and the system back gesture behaving the way ADR-0082 requires
  without a WebView history to walk.
- Splash theme into the first frame — the sequence ADR-0061 established, with no skeleton needed
  because there is no document to wait for.
- The update check, download and installer survive as they are; the prompt moves to Compose.
- FCM, the sync wake and the battery prompt stay native, now driving the Kotlin drain.
- A diagnostics screen replacing `/device` (ADR-0084's withdrawn page stays withdrawn).

**Exit criteria.** Cold start inside budget from a notification, from a deep link and from the
launcher; back never exits from a non-root destination; RTL correct at 320 dp.

**Retires:** the launch skeleton, the Capacitor bridge wiring, the fallback page's role in a launch.

## Phase 3 — the owned products

SpendTrack, LinkSnap, BlogPress, the Quran reader, the account pages that read owned rows, and
the recitation player's controller.

Order follows the surface matrix's `Owner = local-store` rows, and the reference for each screen is
the web component it replaces — read it, port the behaviour, not the markup. The audio player is
already native (ADR-0086): this phase gives it a Compose controller and deletes the plugin shim.

**Exit criteria.** Every owned row in `docs/specs/surfaces.md` has a native screen and an offline
write path, each with a drill or a UI test; the outbox fixtures still pass.

**Retires:** `QuranPlayerPlugin`, the bundled document's reason to exist, `SyncFlushWorker`'s
headless WebView.

## Phase 4 — the remote and server-guarded surfaces

Community (feed, post, editor), News, rates, verify, `/u/<username>`, leads, consultation,
downloader, scan, the marketing pages, auth screens, MCP, `/admin`.

These are the screens where "native" costs the most and buys the least: their content is
server-owned, so their release cadence becomes the APK's. Two things make that tolerable, and both
have to be built here rather than assumed:

- **Content-shaped screens read a server-owned shape.** A feed item, a rate row and a news item are
  DTOs from the same contract, so a copy change is a server change where it can be.
- **An escape hatch exists for a screen that must change now.** A remote-config switch that opens
  one surface in a Custom Tab, off by default, removable once the surface settles. Without it, a
  broken screen is an emergency release.

`/admin` and MCP are ported last in this phase and gated on the security review: the APK is a
distributed binary, so the operator UI is readable by anyone who unpacks it. Nothing in it may be a
capability the server does not re-check.

**Exit criteria.** Every row of the surface matrix has a native screen; a release can be cut and
installed by the update path in one command; the escape hatch is exercised once, on purpose.

**Retires:** the remote-URL shell's reason to exist.

## Phase 5 — cutover

- Remove Capacitor, `capacitor.config.ts`, `capacitor-web/`, the bundled target (#502/#503 become
  dead work), and the plugin list.
- Keep `latest.json`, the installer and `versionCode` discipline; raise the update floor so devices
  on the old shell are told to move.
- Keep the old API shape alive until the installed base has moved. Nothing in the repo should imply
  the old shell is supported after this point — that promise lives in the deployed API and
  progressively in what old clients can still call.

**Exit criteria.** An APK built from `main` contains no WebView; a device on the previous release
updates to it in place; the old shell, frozen, still opens.

## Phase 6 — steady state

Two implementations, one contract, one token file, one set of fixtures. The process that keeps them
honest is:

- contract changes are generated on both sides in the same pull request;
- token changes regenerate both outputs in the same pull request;
- any change to offline semantics updates the spec and fixtures first;
- a screen that exists in one client and not the other is a listed gap, not a discovery.

Each of the four is a check rather than a habit, and [two-clients.md](two-clients.md) is the page that
states them: which command holds each one, what a pull request has to run, and the gaps they do not
cover yet.

## Risks, and what is done about them

| Risk                                | Consequence                                                                        | Mitigation                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Visual drift between web and app    | The product looks like two products                                                | Generated tokens; design review against the web screen for every surface; nothing else catches it |
| Contract drift                      | Runtime failures on a device, discovered by a user                                 | Kotlin generation in CI; a Zod change that is not regenerated fails the build                     |
| Outbox semantics diverge            | Lost or duplicated writes, silently                                                | One spec, one fixture suite, run in both languages; drift is a red test                           |
| Scale                               | 326 components, 28 surface rows, 20 service areas — measured in years, not sprints | Phases 1–2 prove the seam on one product before volume; the escape hatch bounds a bad release     |
| Two release trains                  | The app ships behind the web by default                                            | `versionCode` carries every screen; a release is one command; the cadence is stated in the docs   |
| Operator surface in a public binary | `/admin` readable by anyone                                                        | Server-side guard unchanged; review before phase 4 port; no client-only admin capability          |
| Bus factor                          | One person holds Kotlin and TypeScript, and the seam's reasoning                   | The seam is documented here and in ADR-0089; phase exits are measured, not asserted               |
| Installed base                      | Old shells persist                                                                 | The update path (ADR-0044) and the floor; the old API shape stays until the floor moves           |

## What to decide at phase 0, and not before

Recorded so they are decided once: HTTP client and serializer, DI approach, the Room schema and
migration policy, the token file's home and format, where the outbox fixtures live, and the CI job
that runs the Kotlin suite. Each one is a pull request with the reason in it, not a conversation.
