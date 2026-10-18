# The launch screen is the app's own skeleton, not a logo

The shell is a remote-URL WebView (ADR-0036), so its cold start is the WebView's launch plus the first
remote frame, and the only thing covering that gap today is the launch theme: the background colour
and the icon, dismissed when the WebView draws its first frame (ADR-0054). We extend that surface into
a **stateless skeleton of the app's own chrome** — the same top bar, tab bar and card shapes the first
screen draws, in the site's own tokens — so the handover reads as content arriving rather than a flash
of empty background. It stays stateless: no API call, no storage, no service worker, nothing to keep in
sync, so it needs no over-the-air update and changes only when the theme does. We deliberately do **not**
bundle the app's logic, because the update model — a deploy reaches every installed app — is worth more
than the milliseconds a bundle would save.

## Considered Options

- **Bundle the shell and the account screens.** Rejected: it forfeits instant deploys for the surfaces
  users touch daily, and buys them back only through an OTA channel, while forking the service worker,
  the IndexedDB Local Store and the cookie jar onto a second origin (ADR-0036). The account screens are
  the case worth revisiting if native-first render is ever wanted — they are already client-hydrated
  from the Local Store — but it is a decision to take on purpose, not a side effect.
- **Capacitor Live Updates / an OTA channel.** Rejected for now: the update service, code signing and
  native-version channels ADR-0036 named, plus a new code-execution path into the app.
- **A native first screen in Kotlin.** Rejected: the same effect in a second language, with no
  user-visible gain over the launch theme.
- **A full native app.** Rejected: a second implementation of every product, in a second language, for
  one platform (ADR-0036).

## Consequences

The perceived cold start is bounded by the theme rather than by the WebView's first frame, and the
theme must be kept in step with the app's chrome — which is the same tokens ADR-0054 already restates
in `res/values/colors.xml`. True native-first render stays out of scope, and this ADR records the
trigger for revisiting it rather than leaving it to be rediscovered. Nothing here changes the offline
core, the auth model or the origin, so it is separable from every other decision in this spec.
