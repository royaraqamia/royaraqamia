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

The wake is asked for by the device that delivered the write (`POST /api/push/wake`, session-scoped and
limited per user) rather than observed by the server: sync writes arrive through per-product endpoints,
so a central change feed would be a second description of the same traffic, and it could not tell which
device wrote. The message stays a hint — one `type`, no payload — and the receiver's only action is to
enqueue the drain it would have run anyway.

## Amendment (2026-10-21): the exemption is the one-tap dialog, asked from delivery ([#381](https://github.com/royaraqamia/royaraqamia/issues/381))

The prompt above is now decided and wired. The route is
`Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — the platform's one-tap dialog with the reason
stated. Play restricts its use to specific app categories for **Play-distributed** apps; this shell is
installed directly (ADR-0036), which is the case the restriction does not bind. The alternative routes
either hand the user a settings list to find a switch in
(`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`) or leave the explanation to the app's own copy with no
native ask at all — both spend the same permission-free trust, but less of delivery actually gets
exempted: the list screen asks the user to know which toggle is whose, and copy-only explains a
constraint it could have lifted.

The moment is the one written above, not a cold start. `OutboxDrainWorker` asks when a drain's report
says work is still owed (`DrainDecision.Retry` — the give-up after `MAX_ATTEMPTS` included; the worker
was `SyncFlushWorker` until #651 made the drain native), and
`SyncMessagingService` asks when a wake arrives while the app is not foregrounded. Both funnel into one
gate in `ShellBatteryPrompt` — already exempt (`PowerManager.isIgnoringBatteryOptimizations`), already
asked once (a `SharedPreferences` one-shot), notifications actually enabled, and the app in the
background — and only then post the notification whose copy states the reason; its tap opens the dialog.
Each condition exists for the moment: the exempt check because the system stores the grant for us, the
one-shot because this is one decision and a decline reads the delivery state the pill already reports
rather than a plea, the enabled check because a notification Android would silently drop must not spend
the one ask, and the foreground check because in an open shell the page already reports what is owed.
