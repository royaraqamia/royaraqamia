# The Android shell syncs in the background through FCM and WorkManager

The shell is a remote-URL WebView (ADR-0036) with no native background components, so a write queued
while the app is backgrounded or killed waits until the user reopens it. To close that, the server
sends a **silent high-priority FCM data message** to the user's registered devices when the user has
work waiting, and a native **WorkManager** job wakes on that message — and on a 15-minute periodic
fallback — to drain the Outbox and pull. The Outbox keeps exactly **one** implementation: the job
runs the web sync code in a headless, same-origin WebView rather than reimplementing five per-product
transports in Java, because a second writer is the one thing this system must not grow. When the
WebView cannot run, the write stays durable and is delivered on the next open: the app is never a
place where a write is lost, only a place where delivery is late. A battery-optimization exemption is
requested the first time background delivery has something to deliver, with the reason stated.

## Considered Options

- **An always-on foreground service** — WhatsApp's own mechanism, a persistent connection with a
  permanent notification. Rejected: a permanent notification and a battery cost are the wrong trade
  for a product whose background work is a rare drain, not a live socket.
- **Mirror the Outbox natively and replay in Java.** Rejected for now: it duplicates the transports in
  a second language and creates a second writer. It is the revisit trigger if the headless WebView
  proves unreliable on real devices.
- **Flush on open only.** Rejected: it is the gap this ADR closes.
- **Periodic WorkManager alone.** Rejected as the primary trigger: 15 minutes is its floor and doze
  defers it further; it stays as the fallback the FCM wake is not available to improve on.

## Consequences

The shell gains the WorkManager dependency, a worker, and the manifest entries it needs; `google-services.json`
and the FCM sender already exist (ADR-0038, ADR-0050) and this reuses them. The data message must stay
silent and must never carry the work itself — it names a pull, it does not become a second source of
truth. Background delivery is also why the exemption prompt exists: in doze, an unbattered FCM wake is
deferred like anything else, and a user who is told why may grant it.
