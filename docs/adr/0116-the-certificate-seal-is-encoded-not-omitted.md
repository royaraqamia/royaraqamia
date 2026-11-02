# The certificate seal is encoded, not omitted

A shared certificate is the one surface a stranger reaches: a printed certificate carries a QR, the
QR and the page link both open `/verify/<code>`, and the card on that page draws the same code again
as a seal for someone reading it on a screen. Porting the page natively (#658) put that seal in
question, because the site generates it in the browser from the `qrcode` npm package and the app has
no QR library at all. This records why the app encodes it instead of leaving it out.

## The decision

- **The seal is drawn, from the same string.** `VerifyQrCode` encodes
  `<siteUrl>/verify/<CODE>` with the reference implementation of the same standard the site's package
  writes (ISO/IEC 18004, error correction M, margin 2), so a phone scanning the paper and a phone
  scanning the screen read the same URL.
- **It is a dependency, not a hand-written encoder.** `com.google.zxing:core` is pure Java: no
  renderer, no camera, no UI, nothing that could make the app's own drawing drift. A QR encoder is
  ~350 lines of bit-packing and Reed-Solomon arithmetic whose bugs surface as a code that scans to a
  different string on someone else's phone — the one place in this app where a subtle error is
  invisible to every test that does not decode the result. The pinned version lives beside the other
  Android versions in `variables.gradle`, with the reason.
- **What is tested is the round trip, not the picture.** `VerifyQrCodeTest` encodes with the shipped
  encoder and decodes with the same library's reader, asserting the URL. A screen test would see an
  image; only the round trip sees the content.
- **The link is the page's own address, never a custom scheme.** A scanner held by someone who has
  never installed the app must still reach the certificate in a browser. The app's deep link is a
  bonus for the installed case, not the contract.
- **The seal can be absent and the page still works.** A matrix the encoder refuses draws the box
  without it — the code, the details, the copy action and the link are the substance, and the seal is
  the affordance.

## What was refused

- **Hand-writing the encoder.** Smaller APK, no dependency, and the whole risk of the standard
  implemented from memory. Refused for the reason above: the failure mode is silent.
- **Omitting the seal.** The cheapest port, and a visible divergence from the card the page draws —
  which is the drift `docs/mobile/parity.json` and ADR-0098 exist to forbid.
- **A server-rendered QR image.** It would put the seal on the deployment's critical path for a
  drawing the client can make itself, add a route that exists only to be an `<img>`, and still need
  the app to fetch it with no radio. The site already generates it client-side for the same reason.
- **Keeping `/verify/<code>` as the document.** It would leave the one link a stranger is most likely
  to hold — a printed QR — on the WebView the whole phase exists to retire.

## Consequences

- The APK carries one more library, ~500 KB. It buys the seal on the surface with the widest audience
  and the least room for a "coming soon": a certificate someone was handed on paper.
- A future surface that needs a QR (a member's profile link, a chat invite) reuses `VerifyQrCode`'s
  encoder rather than adding a second dependency, and inherits the round-trip test's shape.
