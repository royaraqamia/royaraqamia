# The camera and WASM posture is site-wide, not per-route

The **Scanner** needs two relaxations of the site's security headers, and both were taken
site-wide rather than scoped to `/scan`: `Permissions-Policy: camera=(self)` replaces `camera=()`,
and `script-src` gains `'wasm-unsafe-eval'`. Camera is `self`, never `*`, because `*` would let any
third-party frame we ever embed borrow a visitor's camera; `microphone`, `geolocation` and
`payment` stay blocked. The decoding engine (`zxing-wasm`, behind the `barcode-detector` polyfill)
is served from our own origin, never a CDN, because `script-src 'self'` forbids one and a
third-party decode path would contradict ADR-0034. Native `BarcodeDetector` is used where it
exists; the WASM polyfill covers iOS Safari and Firefox, which is what makes `'wasm-unsafe-eval'`
non-optional.

## Considered options

- **Native `BarcodeDetector` only.** Rejected: absent in Safari, so the tool would silently not
  work on an iPhone — the opposite of the promise that it reads any QR or barcode.
- **Scope `camera=(self)` to `/scan` with a second header block.** Rejected: Next.js merges
  matching header rules non-obviously, and one site-wide value is a single line to read and audit.
  `camera=(self)` grants nothing until a page calls `getUserMedia`, and the only page that does is
  `/scan`.
- **Load the decoder from a CDN.** Rejected: blocked by our own CSP, adds a third-party request to
  a page whose whole claim is privacy, and hands availability of a core feature to someone else's
  uptime.
- **Run the WASM decoder on the main thread.** Rejected: decode work would contend with the camera
  preview; a Worker keeps the viewfinder smooth, and `worker-src 'self' blob:` already permits it.

## Consequences

The CSP now permits WebAssembly compilation everywhere, which widens the blast radius if an XSS
ever lands — accepted as the cost of iOS support, and mitigated by self-hosting the only WASM on
the origin. `'unsafe-eval'` is still not permitted. A future public tool that wants the camera
inherits the permission without a header change; a future tool that must not have it needs an
explicit override.

## Amendment (2026-10-12): existing is not the same as working

Chrome on Android builds its barcode backend as a component that can be missing on the device. A
`BarcodeDetector` constructed without it still looks fine, but it reports nothing for every frame — a
camera preview that reads nothing and uploads that always fail, with no error raised to give the
game away. The Scanner therefore makes the native detector read one symbol it knows the answer to
(`scripts/generate-scan-fixture.mjs` writes it) before it is handed the camera, and bounds every
decode with a timeout: a detector that cannot read that symbol, or stops answering mid-session, is
dropped for the WASM worker. That is the same rule as rejecting a detector that knows too few
formats — the engine has to keep the promise, not merely exist. The engine a device ended up with
is announced once on the console (`[scan] decoding with …`) — which is how the Android detector
above was confirmed in the field, on a phone whose native detector answered every frame with
nothing.
