# The Scanner never talks to our server

The **Scanner** reads codes on the device and owns no server surface at all: no API route, no
table, no payload logging, no rate limit, no persisted history. A **Scan** completes entirely in
the browser and a **Scan Result** is transient — it lives only in the page, never on the server
and never on disk. Because a payload is untrusted input from a stranger's sticker, the Scanner
never navigates automatically, never renders a payload as HTML, and offers no open action for
anything but `http(s)` — the resolved host is shown before the visitor commits. The only server
call it makes is the pre-existing public Certificate verify API, and only when a payload is one
of our own `/verify/<code>` URLs.

## Considered options

- **Decode server-side, or accept an image upload endpoint.** Rejected: it would send camera
  frames or photos of a stranger's code to us for no functional gain — the browser decodes them
  fine — and it would need rate limiting, storage hygiene and an abuse policy for a tool that has
  no data worth keeping.
- **Persist a local scan history.** Rejected: a scan log is a record of what people pointed their
  camera at. The offline architecture keeps only Owned data on the device, and "nothing is
  stored" is a claim this page can make out loud.
- **Auto-open a scanned URL.** Rejected: a QR is a stranger's payload. One tap of friction, and a
  visible destination host, is the whole defence against a sticker that leads somewhere hostile.
- **Show the raw payload and let the visitor classify it.** Rejected: it pushes the safety
  reasoning onto the person least equipped to do it.

## Consequences

The Scanner is a statically prerendered client route, so it costs only static bytes and cannot be
rate-limited or abused into a bill. It works offline once visited, because the decoder chunk lives
under `/_next/static`, which the service worker serves cache-first. It produces no usage signal
beyond page-level analytics — accepted, because the alternative is logging what strangers scan.
