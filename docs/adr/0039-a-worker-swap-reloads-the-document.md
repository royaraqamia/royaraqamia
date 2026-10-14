# A worker swap reloads the document instead of prompting

A new worker installs as _waiting_ (ADR-0030) and only takes control once the clients of the previous
worker are gone, so the page has to decide what happens then. We decided it **replaces itself**: while
the document is visible the app re-checks for a new worker on `visibilitychange`, `focus` and a
15-minute interval, and when a _swapped_ worker takes control the document reloads once
(`frontend/shared/sw-update.ts`). There is no "update available" prompt, and no `skipWaiting`.

> **Reconsidered 2026-10-14 — see ADR-0042.** The swap half of this stands. The rejection of a prompt
> does not: it rested on "the shell has no chrome to hang it on", which is not true of a prompt the
> page itself renders, and the measurement below is precisely the case a prompt is for — a client that
> is never relaunched has no way to hear about the build that is already downloaded and waiting.

**What a swap waits for, measured 2026-10-14** (Chromium through Playwright, and the same behaviour
seen on the production deployment): a deploy installs the new worker while the tab is open, and the
worker then stays _waiting_ across a reload, with the previous build's caches still serving the page,
for as long as that document lives. The swap lands when the last client of the previous worker goes
away — a closed tab, a killed app, or the Android shell's next cold start. So the premise this work
started from, "any refresh updates the web app", is false: a reload is not a launch, and an open
client does not change build under itself.

What the in-session re-check buys is the launch _after_ that. Without it, a cold start is served from
the previous worker's cache (stale-while-revalidate, `public/sw.js`) while it installs the new worker,
and the new build only appears the launch after — a full launch behind. With it the worker is already
installed when the client returns, the swap takes control during that first navigation, and the
document is replaced if it needs to be: `activate` deletes the previous build's caches, which would
otherwise leave a running page referencing chunks whose cache entries are already gone.

The reload is deferred while the document is hidden, so a background tab does not reload under an
in-flight form; the swap is remembered and applied on the next visibility change. Reloading is safe
for in-page work because writes are idempotent and queued in the Outbox (ADR-0029).

## Considered Options

- **An "update available" prompt.** Rejected here, and removed where it half-existed: its version-probe
  half polled `/api/version` every 60 s to render nothing, and the flags it set were read by no
  component. **Reinstated by ADR-0042** in the form that answers the objection — rendered by the page
  rather than by browser chrome, driven by the browser's own `waiting` state instead of a poll, and
  offering a gesture rather than taking one.
- **`skipWaiting` in the worker's `install`.** Rejected: it activates a new worker under open
  documents mid-flight, the destructive swap ADR-0030 rules out, changing the cache tiers while a page
  is still rendering from them. This is what would have to change for an open tab to move without a
  prompt; the Outbox makes the reload survivable, but the caches change under a live document.
- **Reloading regardless of visibility.** Rejected: reloading a hidden tab saves nothing, while
  reloading under an in-flight form on a slow connection costs the user work. Deferring is free.
- **Nothing, relying on the user to refresh.** Rejected: a refresh does not release the worker (see
  above), and inside the shell the user has no refresh at all, so a client would sit a launch behind
  for as long as it is never relaunched.

## Consequences

A client moves to a new deploy on its next launch, not while it stays open. Detection depends on
`CACHE_VERSION` changing per deployment, because the new worker is what makes the channel fire:
`scripts/generate-icons.mjs` bakes the deployment id into `sw-version.js`, the script `sw.js` imports.
If that key ever becomes a hash of the worker's own bytes, a content-only deploy installs no new
worker and this channel goes quiet — pair such a change with a version-probe signal before making it.

`e2e/sw-update.spec.ts` pins both halves: the mechanism (a swapped worker reloads the document once,
and the tab settles instead of reloading its way to the new build — the controller is compared by
identity, so a repeat `controllerchange` for the worker already in control is not a second swap) and
the activation semantics (a refresh keeps the previous build, a fresh browsing context takes the new
one). The second half records browser behaviour rather than asserting our own: re-measure before
"fixing" it if it ever fails.
