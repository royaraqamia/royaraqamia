# Native push goes through FCM, beside Web Push rather than instead of it

The Android shell renders the live site in a WebView (ADR-0036), and an Android WebView
has no working `PushManager`: the browser subscription path the site uses on the desktop
cannot deliver anything inside the app, however healthy the server thinks the
subscription is. So the shell needs a second transport — FCM — while the browser keeps
the one it has.

The result is two registries and one call site. `push_subscriptions` keeps describing
browser subscriptions (`endpoint`, `p256dh`, `auth`), a new `device_push_tokens` holds FCM
registration ids, and `createPushNotifier()` returns a `PushFanout` over both services, so
every existing producer — the notification fan-out, the habit-reminder webhook, the admin
broadcast — reaches both transports without knowing either exists.

## Considered options

- **Reusing `push_subscriptions` for device tokens.** Rejected: its `endpoint`/`p256dh`/
  `auth` columns describe a browser subscription's encryption keys. An FCM token has none
  of that, so the table would need three nullable columns and a discriminator, and every
  reader would have to remember which half of the row is real.
- **Replacing Web Push with FCM everywhere.** Rejected: desktop browsers are the majority
  of push traffic and VAPID works there; FCM cannot reach a browser without the Firebase
  web SDK, which the perf budget (ADR-0035's gate) would not accept.
- **A Firebase Admin SDK on the server.** Rejected: a dependency tree in every serverless
  bundle to make one HTTP call. The sender signs its own RS256 assertion and talks to
  `messages:send` directly (`backend/services/push/fcm-client.ts`).
- **Importing `@capacitor/push-notifications` in the web client.** Rejected for the same
  reason as ADR-0036's bridge: the package's JavaScript is a web implementation the shell
  never runs. The plugin is read off the injected bridge.
- **Pruning a token when FCM answers `INVALID_ARGUMENT`.** Rejected: that error also covers
  a malformed message, so one payload bug would delete every token in the table. Only
  `UNREGISTERED` and `SENDER_ID_MISMATCH` — the two answers that mean "this token is gone"
  — prune.
- **A stale-token sweep, mirroring `sweep_stale_push_subscriptions`.** Not needed: FCM
  reports a dead token at send time, which is exactly when the dispatch path can act on it.

## Consequences

Registering a token is the one write that does not run under RLS. A token identifies an
install, not a person, and on a shared phone it legitimately moves from one signed-in user
to the next; "own rows only" cannot express that hand-over, so
`POST /api/push/devices` writes with the service role and takes `user_id` from the session.
Reads and the sign-out delete stay caller-scoped, which is all the client ever needs.

The client half lives in `frontend/api/push-native.ts` and is driven by the same toggle as
the browser path: `PushNotificationToggle` asks which transport this device has, and the
Web Push auto-heal is skipped inside the shell — the WebView would otherwise subscribe to
a channel that cannot deliver. The token is cached in `localStorage` so that a sign-out can
unregister it after the app was restarted, and a notification tap routes through the
payload's `data.url` (which is why `url` is always sent, defaulting to `/`).

Three FCM environment variables decide whether the channel exists at all: `FCM_PROJECT_ID`,
`FCM_CLIENT_EMAIL` and `FCM_PRIVATE_KEY`. With any of them missing the service is a no-op,
which keeps every environment that does not run the app silent rather than failing — the
same shape the VAPID keys already have. `google-services.json` is deliberately not
committed: it is per-project config carrying an API key, and the repository is public.

Web Push and FCM are not interchangeable at the payload level: a browser notification is
drawn by the service worker from the JSON payload, while FCM draws it from the
`notification` block and hands the `data` block to the app. `PushPayload` stays the shared
vocabulary; each adapter translates it.
