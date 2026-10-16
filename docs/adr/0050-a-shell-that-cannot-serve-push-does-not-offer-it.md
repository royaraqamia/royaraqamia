# A shell that cannot serve push does not offer it

Tapping the notification bell closed the app. Signed in, on the APK the update flow had
published (`1.0.3`, counter `20003`), instantly, with no panel ever painted — and only
there. In Chrome on the same phone the bell was fine.

The crash was native, not a rendering fault:

```
FATAL EXCEPTION: CapacitorPlugins
java.lang.RuntimeException: java.lang.reflect.InvocationTargetException
  at com.getcapacitor.Bridge.lambda$callPluginMethod$0(Bridge.java:856)
Caused by: java.lang.IllegalStateException: Default FirebaseApp is not initialized in this process com.royaraqamia.app.
  at com.google.firebase.messaging.FirebaseMessaging.getInstance(FirebaseMessaging.java:120)
  at com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin.register(PushNotificationsPlugin.java:114)
```

**Why the bell.** The panel is the only surface that mounts `PushNotificationToggle`
(ADR-0038), and its mount effect heals an FCM token: with a token already in
`localStorage`, opening the panel calls `register()` without anyone tapping anything. Push
had been enabled once, on a build that did have Firebase config, so the token was there.

**Why it was fatal.** `@capacitor/push-notifications` calls `FirebaseMessaging` natively,
and with no Firebase app that throws. Capacitor catches a plugin exception only to rethrow
it on its own `CapacitorPlugins` thread (`Bridge.java:854-856`) — an uncaught exception on
a handler thread, which is process death. Nothing in JavaScript sees it: the `try`/`catch`
in `frontend/api/push-native.ts` cannot catch something that never crosses the bridge, and
`isNativePushSupported()` could not tell, because it asks whether the _plugin_ exists and
the plugin existed.

**Why the build had no Firebase app.** `google-services.json` was git-ignored, and the
release workflow wrote the keystore from repository secrets but nothing for Firebase.
`app/build.gradle` applied `com.google.gms.google-services` only when the file was there
and otherwise logged `Push Notifications won't work` at `info` level. Every APK the update
flow published therefore had no Firebase app in it — the plugin's Firebase calls were
guaranteed to throw, and one of them is reachable from a tap.

**The config is now part of the tree.** It holds the project id, project number, storage
bucket, app id, package name and one Android API key; it has no `oauth_client` and no
client secret. That key is compiled into every APK, and the APK is public — the manifest
points at `https://royaraqamia.com/android/royaraqamia-1.0.3.apk` (ADR-0047) — so
committing the file publishes nothing that is not already in every device's hands. What
must never be committed is unchanged: the FCM **service-account** JSON is what can send to
every device, and it stays in Vercel's environment variables.

**And a build that cannot serve a plugin withholds it.** `app/build.gradle` sets
`BuildConfig.FIREBASE_CONFIGURED` from the same condition that applies the plugin, and
`MainActivity.load()` rebuilds Capacitor's plugin list without
`PushNotificationsPlugin` when that is false. Capacitor generates the page's
`window.Capacitor.Plugins` from that list, so the site sees no push plugin at all:
`isNativePushSupported()` is false, the toggle says notifications are unsupported here, and
no call can reach Firebase. A release build with no config now fails instead of shipping.

## Considered Options

- **A `GOOGLE_SERVICES_JSON_BASE64` repository secret written by the release workflow.**
  Matches the keystore pattern and keeps an API key out of git. Rejected: it is the same
  environment state whose absence caused this crash, on a file that is not a credential —
  the shell would still have no Firebase app anywhere it is built without the secret, which
  is every local build and every preview.
- **Guarding in JavaScript.** The page cannot learn that Firebase is uninitialised: the
  only things it can ask are the plugin (present) and the bridge (live). A guard there
  would have to guess, and a wrong guess is a crash.
- **Letting the plugin stay and catching the failure.** The exception is thrown on a
  Capacitor handler thread and rethrown; the promise never settles. There is no JS-side
  hook to catch it, and the plugin is upstream code this repo does not own.
- **Dropping the push path entirely.** Would remove the crash by removing the feature
  (ADR-0038) — and a build _with_ Firebase serves push fine, which is the state this
  change restores.
- **A guard plugin that rejects `register()` instead of withholding the plugin.** One more
  class mirroring upstream behaviour, and the page would then advertise push and fail at
  the tap. Withholding is the honest answer: the shell says what it can do.

## Consequences

A phone carrying the broken shell only stops crashing when it installs a build that has the
config, so this lands with a shell counter bump — the update prompt does the rest. The
crash is in the _installed_ APK, so no web deploy can fix it.

The API key in the committed file should be restricted in the Google Cloud console to
Android apps with this package name and the release signing SHA-1. That restriction is what
makes an extracted key useless elsewhere, and it is the reason the file being public is
acceptable.

`ShellPluginsTest` holds `PUSH_NOTIFICATIONS_CLASS` to the class path `cap sync` writes into
`capacitor.plugins.json`, so a plugin bump fails a JVM test (`npm run android:test`) instead
of silently re-arming the crash on a device.
