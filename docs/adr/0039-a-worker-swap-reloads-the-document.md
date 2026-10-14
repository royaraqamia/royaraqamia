# A worker swap reloads the document instead of prompting

A new worker installs as _waiting_ (ADR-0030) and only takes control once the document that
blocked it is gone, so the page has to decide what happens then. We decided it **replaces itself**:
while the document is visible the app re-checks for a new worker on `visibilitychange`, `focus` and
a 15-minute interval, and when a _swapped_ worker takes control the document reloads once
(`frontend/shared/sw-update.ts`). There is no "update available" prompt, and no `skipWaiting`.

The prompt could not do the job it was credited with. "Any refresh updates it" holds only in a
browser: the Android shell is a WebView with no reload control, and a backgrounded tab or a
restored PWA window is never reloaded by the user at all. A refresh is also not one build's worth of
freshness — the navigation that follows a deploy is served from the previous worker's cache
(stale-while-revalidate, `public/sw.js`), so the swap lands on the load _after_ it. Detection
therefore has to run by itself, and the document has to be replaced when the build under it changes:
`activate` deletes the previous build's caches, which otherwise leaves a running page referencing
chunks whose cache entries are already gone.

The reload is deferred while the document is hidden, so a background tab does not reload under an
in-flight form; the swap is remembered and applied on the next visibility change. Reloading is safe
for in-page work because writes are idempotent and queued in the Outbox (ADR-0029).

## Considered Options

- **An "update available" prompt.** Rejected, and removed where it half-existed: it cannot reach the
  one client that needs it (the shell), and its version-probe half polled `/api/version` every 60 s
  to render nothing. The flags it set were read by no component.
- **`skipWaiting` in the worker's `install`.** Rejected: it activates a new worker under open
  documents mid-flight, the destructive swap ADR-0030 rules out, and swaps the cache tiers while a
  page is still rendering from them.
- **Reloading regardless of visibility.** Rejected: reloading a hidden tab saves nothing, while
  reloading under an in-flight form on a slow connection costs the user work. Deferring is free.
- **Nothing, relying on the user to refresh.** Rejected: it is not an option inside the shell, and it
  leaves a client pinned to a build for as long as it is never relaunched.

## Consequences

Detection depends on `CACHE_VERSION` changing per deployment, because the new worker is what makes
the channel fire: `scripts/generate-icons.mjs` bakes the deployment id into `sw-version.js`, the
script `sw.js` imports. If that key ever becomes a hash of the worker's own bytes, a content-only
deploy installs no new worker and this channel goes quiet — pair such a change with a version-probe
signal before making it.

The reload costs one extra document load in whichever launch follows a deploy. It is bounded: the
controller is compared by identity, so a repeated `controllerchange` for the worker already in
control is not a second swap, and `e2e/sw-update.spec.ts` asserts that a tab settles instead of
reloading its way to the new build.
