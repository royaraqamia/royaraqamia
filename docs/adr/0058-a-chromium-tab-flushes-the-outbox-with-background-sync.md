# A Chromium tab flushes the Outbox with Background Sync

Instant delivery (spec, property 3) needs a flush that outlives the page. On the web the only
mechanism that does so without a live document is **Background Sync**: the write path registers a
`sync` tag when `'sync' in registration`, and `public/sw.js` answers the `sync` event by draining the
Outbox through the same sync engine the page uses, so there is one implementation of the queue and
one of its ordering. Where the API is absent — Safari and Firefox have neither Background Sync nor
Periodic Background Sync — we keep the in-page triggers (online, visibility, focus, manual retry) as
the whole story and let the pending count say so, rather than implying a delivery we cannot make.

## Considered Options

- **In-page triggers only.** Rejected: it is the current behaviour, and a tab the user closed still
  flushes nothing.
- **Periodic Background Sync.** Rejected: unsupported in Safari and Firefox, and gated on install and
  engagement even where it exists, so it cannot be the guarantee.
- **A server-sent Web Push to wake the worker.** Rejected: it would mean asking for a notification
  permission we only want for real notifications, and on iOS it needs the app installed. The Android
  shell solves the same problem natively (ADR-0059).
- **Flush from the page with the page kept alive.** Rejected: a background tab's timers are throttled
  and a closed one is gone; there is no version of this that survives a closed tab.

## Consequences

The service worker now owns a flush path, so the Local Store and the engine must be reachable from the
worker realm, not only the page — and the two must not race, which is why the flush stays behind the
Web Locks leader the engine already takes. Recovery is unchanged: a failed replay backs off and
retries, and a permanent failure is surfaced. Safari and Firefox users get in-page flushing and must
be told the pending count plainly; we do not gate any feature on their browser.
