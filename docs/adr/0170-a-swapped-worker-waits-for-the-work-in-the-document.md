# 0170 - A swapped worker waits for the work in the document

ADR-0039 has the page replace itself when a _swapped_ worker takes control, because that worker may be
the last one holding this build's chunks. ADR-0134 bounded the _take_ so a load cannot reload under
someone who has started reading or typing. The swap had no such bound, and on 2026-11-12 that cost a
member a voice note.

## What was measured (2026-11-12, #1320)

Both browsers, production, `royaraqamia-v1.149.4` deployed over the build the tabs were served:

- **A clean load takes a deploy.** Edge, first load after the deploy: the take ran (guard written,
  `waiting` cleared) and the document landed on the new build. The ADR-0134 promise holds for a load
  nobody touches.
- **One interaction during the probe refuses the whole load.** Chrome, reload plus four seconds of
  scrolling: the worker stayed `waiting`/`installed`, the guard was untouched, the document did not
  move, and the deploy landed on a later load only. That is the shape behind "several reloads kept the
  old build".
- **The swap replaces a document with no regard for what is in it.** Production build, real Chrome,
  controlled deploy: a tab with typed, unsent text in a field was replaced when a second tab took the
  deploy — `performance.timeOrigin` moved, the field came back empty, and the replaced tab's take
  guard never changed, so `userHasActed` was never asked. A five-minute recording (the note's own
  `CHAT_VOICE_NOTE_MAX_MS`) died at its stop on exactly this path: a page that navigated itself while
  the bar was closing.

## Decision

1. **A surface holds the reload while it has work.** `holdUnrequestedReload()`
   (`frontend/shared/sw-update.ts`) returns a release function; the work's own end — sent, discarded,
   stopped, unmounted — is what releases it. There is no timer: the five-minute note is longer than
   any cap that would not become an arbitrary choice about someone else's work.
2. **Both unrequested reloads go through it.** The swap (`watchWorkerUpdates`) re-checks on release
   instead of reloading on the spot, and the take's deadline (`applyWorkerUpdate`, ADR-0055's backstop
   for a message that lands nowhere) waits the same way. A take that starts at load can otherwise
   reload a document the person has begun typing in during its five-second window.
3. **The composer is the holder that exists today.** `ChatComposer` holds while it has an unsent
   draft, a staged file (including a finished clip), a running capture or a clip being encoded — the
   three ways the measured loss happens. It is the row both threads draw, so the member thread and the
   assistant thread cannot differ here.

This is affordable because a swap no longer _must_ happen at the swap's own moment. Since #488 the
caches outlive a release: `activate` deletes only caches whose name is not the schema's
(`public/sw.js:606`), `cacheFirst` still answers a previous build's content-addressed chunks
(`public/sw.js:1010`), and a previous build's entries are evicted first only once the store passes its
150 MB budget (`public/sw.js:881`, `CACHE_EVICT_TO`). The profile measured for #1320 was using 6.6 MB.
So a held document keeps running on the build it was served; if the budget has really taken its
chunks, the next chunk request fails and the document is replaced then, which is no worse than the
reload arriving at the wrong moment.

## Consequences

- **A deploy is not delayed by a hold.** The swap replaces one document; the update itself is still
  the next document load (ADR-0134). A held tab takes the new build when its owner next loads it.
- **A document can outlive its build while it holds work.** That is the trade, and it is the same
  trade ADR-0134 already made for a document someone is reading.
- **The failure mode moves from data loss to staleness.** A hold that never releases — a bug in a
  holder — leaves a document on its build until the next navigation. Nothing is destroyed, and the
  unit that leaked is visible as a document that never swapped.
- **The header comment in `sw-update.ts` was wrong and is corrected**: `activate` does not delete the
  previous build's caches since #488, so the swap's premise is the byte budget, not activation.

## Alternatives considered

- **A cap on the hold (1, 5, 10 minutes).** Rejected: the measured recording is five minutes and its
  stop is exactly where the swap landed, so any cap either expires mid-note or is a guess; the work's
  own end is the only honest boundary.
- **Only the recorder holds.** Rejected: the staged clip, the finished clip in the composer and a
  typed draft are the same loss, and the composer is one place to state it.
- **A prompt before the swap (ADR-0042).** Rejected again, unchanged by ADR-0134: the question has one
  useful answer, and the reload is not what the person asked for.
- **Refuse the swap entirely (never replace a document).** Rejected as this change's shape: a
  document whose chunks the budget has taken cannot be kept alive, and only the worker knows when a
  chunk is genuinely gone. Removing the swap's reload is the follow-up this makes possible
  (serve each client the build it was served from), not something a page-side change can decide.

## Verification

`frontend/shared/__tests__/sw-update.test.ts` pins the new behaviour: a swap waits while the document
holds work and reloads when the last hold is released; a take that lands nowhere waits the same way.
The existing cases stay: a swap with nothing held still reloads once, a hidden document still holds
it, and the first install is still not a swap.

The browser-level case needs a signed-in thread (a draft and a recording), so it is not a CI spec: it
is measured with the owner's own browser through the `browse` server, as recorded above
([docs/agents/browser.md](../agents/browser.md)). The production measurement and this change's own
local run used the same instrument: a controlled `sw-version.js` deploy, `performance.timeOrigin` for
document identity, and the take guard key for whether a take ran.

> **Amended 2026-11-12 - see ADR-0171.** The swap described here no longer reloads: the worker keeps the
> build each live client was served, so there is nothing for a swap to destroy. The hold still guards the
> two reloads that remain - the take's deadline when a message lands nowhere, and the `STALE_BUILD`
> fallback for a chunk whose build is genuinely gone.
