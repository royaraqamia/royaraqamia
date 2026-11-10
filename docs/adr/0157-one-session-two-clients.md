# One session, two clients

[ADR-0117](0117-the-document-is-the-app-until-a-port-is-the-same-screen.md) made the site the app's
sign-in and recorded the cost: "the native session and its background work go quiet". A member signed
in on the phone reached `/account/plan`, the homepage's account set or the bell as a guest, because the
page keeps its session in `@supabase/ssr`'s cookie and the app keeps its own in a Keystore-backed
refresh token. [#1194](https://github.com/royaraqamia/royaraqamia/issues/1194) phase 5 needs the
account path on the phone, and this is what it needs first.

## The decision

**There is one session, and the cookie jar is where it lives.** The app reads it and writes it; the
page reads it and writes it; neither keeps a second copy that can drift.

- **Read.** `Session.syncFromDocument` reads `sb-<ref>-auth-token` from the WebView's jar and adopts
  it when it is newer than what the app holds (`expires_at`) or names a different member. The shell
  calls it on every resume and on a deep link; the API client calls it before a refresh.
- **Write.** A rotation the app performs — a refresh, or the password grant — is encoded back into the
  jar in the package's own format (`base64-` + base64url JSON, 3180-character chunks, stale chunks
  removed), so the page's next request is authorised by the token the app just minted.
- **One writer at a time.** The server rotates a refresh token single-use. While a page is in front
  (`DocumentForeground`, set by the document activity), the app does not renew: the page owns the
  chain, and a rotation behind its back would sign the member out of the site they are looking at.
  The app renews on the resume it is handed, which is also when it has work of its own to do.
- **Sign-out crosses.** Clearing the session clears the jar, and a jar with no session signs the app
  out when the session came from the page. One client's sign-out is the other's.

The format is a dependency's, not ours, so it is pinned by a fixture written by `@supabase/ssr`
itself: `shared/fixtures/session-cookie/manifest.json` is read by
`DocumentSessionFixtureTest` and re-derived by `shared/fixtures/__tests__/session-cookie.test.ts`. A
package upgrade that moves the encoding is red on both clients.

## Why not the alternatives

- **A read-only bridge: adopt the access token and never refresh.** It cannot sign anyone out, and it
  satisfies the acceptance today. It also leaves the app with no way to authenticate more than an
  hour after the page last refreshed, which is most background drains — and it is the half of the
  bridge that would have to be written again the moment the app needs a token of its own.
- **A JavaScript interface: the page hands the shell its session.** It removes the cookie parsing,
  and it keeps two writers with no shared store: the page's rotation and the app's would still be two
  chains, and the losing one gets a refusal. The jar is the only storage both clients already use.
- **Let each client keep its own session.** Two refresh chains from one account is what the server's
  single-use rotation exists to refuse; in practice it is a member signed out of whichever client
  refreshed second.

## What this costs

- **The app depends on a cookie format.** It is the package's, and the fixture is what makes a move a
  test failure rather than a sign-out. A future `@supabase/ssr` that changes the key, the prefix or
  the chunk size is a change to `DocumentSessionCookie` in the same pull request as the upgrade.
- **A native renewal is deferred while a page is on screen.** Work the shell owes waits for the
  resume the document hands it, which is seconds, not a session. Nothing native writes while the
  document is the only UI today.
- **Reading the jar on the launch path costs a WebView provider load.** It happens after the first
  drawn frame and before the hand-over, which is the same provider the document is about to build.
- **A sign-in on the web browser is not this session.** The WebView's jar is separate from Chrome's;
  the member signs in once per client, as they do today.
