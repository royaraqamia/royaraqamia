# Google sign-in leaves the WebView, and returns to it

Google refuses to serve its consent screen to an embedded WebView
(`disallowed_useragent`). A shell whose whole point is that it renders our real sign-in
page therefore cannot show that screen, so the flow leaves: the app opens the Supabase
authorize URL in the system browser, and Supabase returns to `royar://auth/callback`,
which the system browser cannot render and hands back to the app. The app then reloads
the equivalent `https://royaraqamia.com/auth/callback` inside its own WebView — and _that_
request, not the browser, exchanges the code for a session.

Returning to the app rather than finishing in the browser is the part that matters.
`@supabase/ssr` keeps the PKCE verifier in a cookie, and cookies belong to a cookie jar;
the system browser's jar is not the WebView's, so a flow completed there would produce a
session the app can never see.

## Considered options

- **A native Google Sign-In plugin.** Rejected for now: it needs a Google client ID and
  server-side ID-token verification, and it becomes a second, divergent sign-in
  implementation living beside the web one.
- **Spoofing the user agent so Google does not notice the WebView.** Rejected: it works
  directly against Google's stated intent, is undocumented behaviour, and can stop
  working without notice.
- **Finishing the exchange in the system browser**, on a page of our own origin. Rejected:
  the resulting session cookie lands in Chrome's jar and the app stays signed out.
- **Dropping Google sign-in on mobile** in favour of email and the OTP. Rejected: it
  removes a sign-in method the site offers, for a problem that has a real solution.

## Consequences

Three places must agree on the callback string, and none of them can import the other two:
`NATIVE_OAUTH_CALLBACK_URL` in `shared/contracts/auth.ts`, the intent filter in
`android/app/src/main/AndroidManifest.xml`, and Supabase's redirect allowlist — where
`royar://auth/callback` has to be added by hand, next to the `https://…/auth/callback`
entry the web flow already needs. Forgetting the allowlist entry shows up as Supabase
refusing the redirect, not as anything in this repository.

`app/auth/callback/route.ts` becomes the one place a session is created by code exchange,
and it narrows the user-supplied `next` through `safeRedirect`, so a crafted callback
cannot turn it into an open redirect. A failed exchange sends the visitor to the login
page carrying `error=oauth_failed`, which the page now renders — in the app that page is
also what an old WebView shows, since a non-2xx document there loses the native bridge
(ADR-0036) and the login page must not depend on it.

This route handles the PKCE `code` exchange only. `frontend/ui/linksnap` still has a
`window.location.replace('/auth/callback' + window.location.hash)` for the older implicit
flow; no route has ever existed at that path, so nothing regressed, but a fragment is never
sent to the server and that reference would need its own handler if that flow were revived.
