# The shell has a WebView floor and a local page beneath it

The Android shell is a remote-URL WebView (ADR-0036), so a launch with no network, or on a WebView the
site cannot run on, used to end in a blank WebView or a page that rendered but never hydrated. We set
`android.minWebViewVersion` to **111** and point `server.errorPath` at a page bundled in `capacitor-web/`
(`unavailable.html`). Capacitor loads that page from `https://localhost` on a main-frame navigation
error and, before the site is requested, when the installed System WebView is below the floor. The page
works without network, reads the WebView major from its own user agent, and shows either the retry copy
or the update/unsupported copy. **Retry is a user action, never a timer**: an unreachable site must not
become a reload loop.

## Why 111

The floor is the site's own browser baseline, not a number chosen for the shell:

- Next.js 16 supports **Chrome 111+** (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`),
  and Tailwind CSS 4 targets the same baseline.
- The production client chunks already require ES2022: parsing `.next/static/chunks/*.js` with acorn
  fails 29 files at ES2021 and passes at ES2022. The syntax is class fields and static blocks —
  `class e extends Map{static{a(this,"OrderedDict")}#e;…}` — which Chromium shipped in 94.
- The API 30 emulator image used in the shell notes carries WebView **83.0.4103.106**. It cannot parse
  the chunks (`SyntaxError: Unexpected token '='`), which is the "renders but never hydrates" page this
  issue is about.

ES2022 syntax alone would put the floor at 94, but syntax is the cheapest thing to satisfy. The runtime
APIs and the CSS the site relies on are what Next 16 and Tailwind 4 name 111 for; shipping a WebView
that parses the bundle and then fails on `structuredClone`, `:has()` or a `@property` rule would only
move the same blank page further in. 111 is the documented floor of both frameworks, and Chrome 111
implements the ES2022 syntax the bundles use.

## Considered options

- **Leave Capacitor's defaults (`minWebViewVersion: 60`, no `errorPath`).** Rejected: that is the blank
  page in the issue. Capacitor logs "System WebView is not supported" and carries on.
- **Fall back only on network errors, not on an old WebView.** Rejected: the unhydrated page is the
  harder failure to diagnose — it looks like a slow load, and nothing on the device says why.
- **A native error activity instead of a local page.** Rejected for now: it would need a custom
  `WebViewClient` to intercept the error path, and it would lose the site's typography and RTL card for
  no user-visible gain. Static HTML/CSS and ES5 are renderable by every WebView Capacitor supports.
- **Auto-retry on `online`, or a timed reload.** Rejected: with the site still down, that is an
  infinite reload loop; with the site up, the page would disappear before the user read it. A link is
  the whole retry mechanism, so one tap is one attempt.
- **Raise the floor to a newer WebView (120, 125) for margin.** Rejected: no evidence supports it, and
  it strands devices that meet the site's documented baseline.

## Consequences

`unavailable.html` is in `capacitor-web/`, so `cap sync` copies it into the APK; it references its two
font files relatively, and every resource is local. It is deliberately ES5 and must stay that way, even
after the rest of the site raises its own target. The page has no Capacitor bridge (on Android the error
page does not get one), which is fine: it needs none. It is served from `https://localhost`, not the
site origin, so it also has no session or cookies — by design, since there is nothing to authenticate.

The floor is compared against the installed WebView's major version. Huawei devices use Capacitor's
separate `minHuaweiWebViewVersion`, which keeps its default (10); that engine's version numbering is not
the Chromium number, and it was not measured here. This decision covers the System WebView path, which
is what the emulator and the shell notes measure.

`scripts/__tests__/shell-fallback.test.mjs` pins the config to the page, parses the inline script as ES5,
refuses automatic navigation, and holds the bundled fonts to the site's own files. The emulator drill in
`docs/mobile/android-shell.md` records what the below-floor copy looks like on WebView 83.

## Amendment (2026-10-21, #447): the failure is recovered once, on reconnect

"Auto-retry on `online`, or a timed reload" was rejected above on the wording alone: as _automatic_
retry it is a loop. Phase 0 of the offline-first roadmap needed the narrower version, one bound
attempt instead of a mechanism:

- The trigger is only the `online` event — there is still no timer, no interval and no
  `navigator.onLine` probe. A page whose radio never comes back is read for as long as the user
  needs it.
- The listener exists on the reachability copy only. The below-floor update card has no automatic
  action at all: reloading cannot update a WebView.

One failed main-frame load still produces one page load. And the reload that reconnect triggers
cannot happen twice in a session: before navigating, the listener writes
`rqq-unavailable-recovered` into `sessionStorage` (on the `https://localhost` origin the page is
served from), and every page load that finds the flag set arms nothing. A site that is _still_ down
after the reload therefore serves this page again with retry-by-tap only — the original guarantee —
and a site that came up delivers the user without a tap. The flag lives for the browsing session by
design: a later outage in the same session costs one tap, which is the old behaviour every time it
matters.

`scripts/__tests__/shell-fallback.test.mjs` holds the guard, not just the copy: one `online`
listener, the flag written before navigating with `location.assign` (never `location.href`,
`location.replace` or `location.reload`), and the update-card branch still automatic-free.
