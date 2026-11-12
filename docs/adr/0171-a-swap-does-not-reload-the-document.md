# 0171 - A swap does not reload; the worker serves each client its build

ADR-0039 replaced a document whenever a _swapped_ worker took control, because that worker might be the
last one holding the document's chunks. The premise has not been true since #488: `activate` keeps the
caches by schema rather than by build, and a previous build's content-addressed chunks stay readable.
What remained true was the byte budget, which evicts a previous build's entries first — so the swap was
a bet on the budget rather than a certainty of a broken page. That bet cost a member a five-minute voice
note on 2026-11-12 (#1320), and ADR-0170 made the reload wait for the work in the document. This ADR
removes the reload instead of timing it.

## What was measured (2026-11-12, #1320, #1334)

- **The swap has nothing left to protect.** `activate` deletes only caches whose name is not the
  schema's (`public/sw.js`), `cacheFirst` still answers a previous build's chunks, and eviction moves
  the previous build's entries first only once the store passes its 150 MB budget. The profile in the
  measurement used 6.6 MB. The reload is a leftover from when activation purged the previous build's
  cache by name.
- **The take refused a load for the rest of the document's life.** A reload followed by four seconds of
  scrolling left the worker `waiting` and the guard untouched, and the deploy landed only on a later
  load. `userHasActed` asked "was this document ever touched", not "is it being used now".
- **A load in a background tab did not count as a load.** The take refuses while hidden and nothing
  retried on `visibilitychange`.

## Decision

1. **The worker records the build each client was served.** A navigation's response already carries
   `x-sw-build` (`stampBuild`); the worker stores that stamp against `event.resultingClientId`. The
   registry lives in the meta cache, because the worker that needs it is the _new_ one after a swap:
   `activate` restores it, prunes clients the browser no longer reports, and only then rebuilds the
   index and evicts.
2. **A live client's build is pinned.** `isPinned` treats a `/_next/static/` entry as pinned while any
   open client is running the build stamped on it. The entry stops being pinned when the last document
   of that build closes, and it is then the first thing the budget reclaims. A store that cannot get
   under budget without evicting a live build logs the excess, exactly as it does for the current
   build's own pinned shell.
3. **The swap reload is removed.** `watchWorkerUpdates` no longer listens to `controllerchange`; a
   swapped worker taking control is not a reason to replace a document, because every document's build
   is still being served.
4. **The take is bounded by idleness, not history.** `takeWaitingUpdateAtLoad` replaces the
   `userHasActed` latch with `UPDATE_IDLE_WINDOW_MS` (3 s): a touch inside the window defers the take,
   and the take runs in the next pause. While the document is hidden it installs no timer and the
   `visibilitychange` listener resumes it, so a background load takes the waiting build when the tab
   comes back. `UPDATE_TAKE_GUARD_MS` still stops a take that never activates from looping.
5. **One fallback reload remains, and only for a genuinely gone build.** `cacheFirst` reports
   `STALE_BUILD` to the client that asked when a `/_next/static` request answers 404 or 410 — the URL
   is content-addressed, so the release is not there to fetch either. The page reloads through the
   same visibility and `holdUnrequestedReload` gates (ADR-0170). An offline failure stays a 503: that
   document's build has not gone anywhere.

The take itself is still a chosen reload: `applyWorkerUpdate` now owns it, listening for the controller
change (or the existing deadline when the message lands nowhere) and reloading once. That keeps
ADR-0134's promise — a load takes the deploy — without making every swap one.

## Consequences

- **A deploy no longer replaces any document.** A document served from build A keeps its chunks and its
  in-progress work across a swap; document identity (`performance.timeOrigin`) does not change.
- **Two builds can share the cache for as long as an old document is open.** That is bounded by open
  documents, not by time, and the budget still reclaims the older build as soon as its last client
  closes.
- **The worker can pin too much if the client list is unavailable.** `clients.matchAll` failing is
  logged and the registry's answer is kept: pinning a closed client's build for one more pass is
  cheaper than evicting a live document's chunks.
- **A lost registry degrades to the old behaviour, safely.** If the meta cache is cleared, a stale
  document's chunk request eventually misses and 404s, and the `STALE_BUILD` fallback replaces it. The
  difference is a reload at the genuinely broken moment instead of one at every swap.
- **ADR-0039's swap half is superseded; ADR-0134's take half and ADR-0170's holds stand.** The hold is
  still what keeps the fallback and the take's deadline off a recording or a draft.

## Alternatives considered

- **Serve each build from its own cache name.** Rejected: it would make `activate` delete a build's
  cache again, which is the destruction #488 removed, and it would fragment the byte budget by build.
- **Keep the swap reload but only for documents with no work.** Rejected as this change's shape: it is
  ADR-0170 with a different answer to _when_, and it still destroys scroll position, form focus and
  anything a hold does not know about. The worker can answer the question exactly (is this build still
  here?) instead of the page guessing it.
- **Never reload a document at all.** Rejected: a chunk whose build is genuinely gone cannot be
  patched from the running document, and only the worker knows when that happened. The fallback is the
  smallest reload that keeps the app working.
- **A time cap on the idle window.** Rejected: the window is the question "is the person using this
  now?", and a page that is continuously used should not be reloaded at an arbitrary deadline. If they
  keep using it, the deploy waits for the next load or the next pause.

## Verification

`frontend/shared/__tests__/sw-update.test.ts` pins the page half: a touch defers the take into the next
idle window, repeated use keeps deferring it, a hidden load takes on `visibilitychange`, and a
`STALE_BUILD` report reloads only when visible and no hold is up. `scripts/__tests__/sw.test.mjs` pins the
worker half: a release keeps a live client's build chunks through an eviction, lets them go once the
client closes, and reports `STALE_BUILD` only on a 404/410 — not on an offline failure.

`e2e/sw-update.spec.ts` pins the browser behaviour on a production build: a document served from build A
survives a swap with its identity unchanged and no navigation, and a load in a background tab takes the
waiting build when the tab becomes visible. The interaction case stays a unit test, because the window
is what the page owns, and the browser spec's job is the part only a real worker can prove.
