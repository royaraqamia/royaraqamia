# The two-origin shell spike (issue #500)

Plan B for the Android shell is decided, not being weighed: the app's **owned** surfaces ship
inside the APK and the public/server-guarded ones stay remote. What is still unknown is whether
one Capacitor app can hold a **local** origin (`https://localhost`, the bundled document) and a
**remote** one (`https://royaraqamia.com`, the live site) at the same time, with back, deep
links, the OAuth return trip and a session that survives the crossing.

This document is the spike: what it builds, how to run it on a device, and what has to be filled
in before the answer counts. Nothing here ships — the branch is promoted or deleted.

## What exists

| Piece                  | Path                                      | Why                                                                                           |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bundled surface        | `app-native/habitflow/`                   | Mounts the **existing** `HabitflowPageClient` through Vite, not a forked component            |
| `next/*` stubs         | `app-native/habitflow/next-shims/`        | `navigation`, `link`, `image`, `dynamic` — the modules the surface imports at runtime         |
| Stylesheet             | `app-native/habitflow/spike.css`          | The shell's and HabitFlow's compilations on one document                                      |
| Origin crossing        | `app-native/habitflow/crossing.ts`        | Same WebView (`location.assign`) or Custom Tab (`@capacitor/browser`), switchable at run time |
| Bearer session         | `app-native/habitflow/session.ts`         | Refresh token in `@capacitor/preferences`, access token in memory, native HTTP                |
| Credential probes      | `app-native/habitflow/probes.ts`          | What the live server answers for that token                                                   |
| Spike chrome           | `app-native/habitflow/spike-panel.tsx`    | The three controls the device session needs; not product UI                                   |
| Build                  | `vite.config.ts` → `capacitor-web/spike/` | `chrome111` target, `next/*` aliased, `NEXT_PUBLIC_*` inlined                                 |
| Spike Capacitor config | `capacitor.config.spike.json`             | `server.url` unset, `androidScheme: https`, `allowNavigation` for the remote host             |
| Packer                 | `scripts/android-spike.mjs`               | Writes the two files `cap copy` would have written, then builds the debug APK                 |

`server.url` is deliberately unset, which is the difference from the shipped shell: the WebView
boots `https://localhost` from the APK. `allowNavigation` stays, because a same-WebView crossing
would otherwise be handed to the system browser by Capacitor.

## Running it

```powershell
npm run spike:build            # vite build → capacitor-web/spike
npm run spike:apk              # copies that into the app, then assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# back to the shipped shell afterwards — the spike leaves generated files in place
npm run android:sync
```

The spike's own panel sits under the dashboard: sign in (Bearer), run the probes, switch the
crossing mechanism, open `/community`, and read the return trips it has seen.

## The veto table

Every row must be answered **on a cheap real device**, not the emulator, and the answer pasted
back into the issue. The commands are the real ones on this branch — see the first finding for
why they are `https://` and `royar://`, not the scheme the issue names.

| Question                            | How to ask it                                                                                                | Passing answer                                                                                                                                                                                                                                                            | Result |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Local route → remote route and back | Panel → _فتح /community_ under each mechanism, then the back gesture                                         | Same WebView: back returns to the bundled route at the same scroll position, no duplicate entry. Custom Tab: the tab dismisses back into the bundled route, and the app is where it was                                                                                   |        |
| Deep link into a local route        | `adb shell am start -a android.intent.action.VIEW -d https://royaraqamia.com/habitflow`                      | Lands on the bundled surface with the app warm; no network round trip for the document                                                                                                                                                                                    |        |
| Deep link into a remote route       | `adb shell am start -a android.intent.action.VIEW -d https://royaraqamia.com/community`                      | Resolves through the chosen mechanism — not a blank WebView, not the site's 404 inside the APK                                                                                                                                                                            |        |
| OAuth sign-in                       | `adb shell am start -a android.intent.action.VIEW -d "royar://auth/callback?code=test"` after a real sign-in | The return trip reaches the app (panel's _روابط عائدة_ list) and the bundled surface is authenticated afterwards. **This spike signs in with Bearer**, so the row records the return trip; whether an OAuth-minted session can cross the origin at all is #501's question |        |
| Session continuity                  | Sign in on the site, then in the app; compare the probes                                                     | `/linksnap/api/links` answers 200 for the app's token (the server accepts a Bearer credential from a bundled origin). The reverse — a session started in the app being usable on the site — is **not** possible today and must be stated as such                          |        |
| The update dialog                   | Open `app-info` from the bundled surface's `/account` crossing, or trigger the shell's own update prompt     | Still reachable and still works from inside a bundled route                                                                                                                                                                                                               |        |

Baseline numbers (`#487`'s instrumentation, cheap device): cold open → content, warm open →
content, tap → optimistic paint, APK size delta, build time delta. Append them here and wire
them as the shell-release budget.

## Findings from building it

These are the things the spike already knows. Each one is work the promoted design needs; none
of them blocks the device rows above.

1. **The issue's scheme strings do not exist.** There is no `royaraqamia://` scheme in
   `AndroidManifest.xml`: deep links are `https://royaraqamia.com/*` with `autoVerify`, and the
   OAuth return trip is `royar://auth` (manifest, `NATIVE_OAUTH_CALLBACK_URL` in
   `shared/contracts/auth.ts`, and the Supabase redirect allowlist). Use those in `adb`, and fix
   the issue body so the device session is not chasing a URI nothing handles.

2. **Owned-data reads are cookie-only.** `linksnap` resolves a Bearer token
   (`withSessionOrBearerUser`); `habitflow` resolves the session cookie
   (`withAuthenticatedUser`), and its handlers need a **token-scoped** Supabase client, not just a
   header they can read. The panel shows both answers side by side (200 / 401). This is #501's
   job, and it is the reason the bundled surface cannot yet pull its Local Store from the server.

3. **The transport has no base URL.** `frontend/transport/http.ts` and every
   `request('/habitflow/api/…')` are root-relative, so from `https://localhost` they address the
   APK, not the site. A bundled surface needs either a base-URL seam in the transport or a fetch
   rewrite at boot; the spike does neither, so the Local Store renders what it has and no more.

4. **Nothing answers CORS for `https://localhost`.** `Authorization` makes the request
   preflighted, and `proxy.ts` has no allowlist. The spike's probes use `CapacitorHttp` (native
   HTTP, no CORS gate) so they measure the server's answer rather than the preflight; keeping that
   transport, or adding an origin allowlist, is a decision the promoted design has to state.

5. **Route-level providers are part of the surface.** `app/habitflow/(app)/layout.tsx` mounts
   `MotionRoot` (#496), and `m` throws outside `LazyMotion` — without it every entry animation
   stays at `opacity: 0` and the page looks empty while passing every DOM assertion. Any bundled
   entry has to reproduce the route layout's providers, not only the root layout's.

6. **Two stylesheets, one document.** The site cuts CSS per surface (#497); the APK has one
   document, so `spike.css` imports the shell's and HabitFlow's compilations together. That
   duplicates the preamble (`surface.css`) and is the one place the spike does not reuse the
   site's shape. A promoted design needs a bundled variant of the split, or one stylesheet.

7. **`public/` is all-or-nothing.** The build copies `public/` as Vite's `publicDir`, which drags
   in `public/quran/**` and the service worker: 8.36 MB of output for a surface that needs fonts
   and a handful of icons. Measured as-is rather than trimmed, because trimming is #502's
   decision; the numbers below are the worst case.

8. **The build needs the public env inlined.** Next inlines `NEXT_PUBLIC_*`; Vite does not, so
   `vite.config.ts` reads the site's env files and defines them. `NEXT_PUBLIC_WHATSAPP_PHONE` is
   required at boot, so a build machine without `.env.local` otherwise fails at runtime, not build
   time.

### Measured build (this branch, debug)

| Artifact        | Size    |
| --------------- | ------- |
| Everything      | 8.36 MB |
| JavaScript      | 1.56 MB |
| CSS             | 277 KB  |
| Fonts (`woff2`) | 291 KB  |

These are build numbers, not device numbers — the veto table's baseline is still the `#487`
instrumentation on a real phone.

## What must not ship

The spike branch is either promoted (with 1–6 addressed) or deleted. A half-bundled app — the
APK booting `https://localhost` while owned routes still expect cookies, relative URLs and CORS —
is worse than the remote-URL shell it replaces, and `npm run android:sync` is what puts the
shipped shell back in the meantime.
