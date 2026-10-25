# The Recitation's offline copy is fetched from the audio host, not through our origin

ADR-0062 vendored the bytes onto `audio.royaraqamia.com` and closed with a promise: "Audio is served
from a host of ours but not from our origin, so the site's CSP has to name it... and the offline
download needs `connect-src` as well." #559 is that download, and the seam it rides on has to be
decided before any of it is written, because the seam decides whether a second copy of the audio can
exist at all.

The answer is the cheapest one available: **the page fetches the host directly, the site allows that
one origin to `connect-src`, and the bytes are kept in OPFS.** No new origin, no proxy, no worker
route, and `public/sw.js` is not touched.

## What is already true

Measured on 2026-10-25 against a vendored file (`ar.alafasy/001/001.mp3`, 49513 bytes):

- `Origin: https://royaraqamia.com` → `Access-Control-Allow-Origin: https://royaraqamia.com`,
  `Vary: Origin`, `Accept-Ranges: bytes`, and `Range: bytes=0-1023` answers `206`. So a browser fetch
  of the bytes is already permitted by the bucket, which is what ADR-0062's CORS line bought.
- `http://localhost:3000` is echoed too, so the download runs under `npm run dev` and in `e2e`.
  `https://example.com` and a `*.vercel.app` preview are not echoed, so previews can stream but not
  download — by design, and unchanged here.
- The only barrier is our own header: `connect-src` (`next.config.js:16`) lists `'self'`,
  `api.royaraqamia.com`, `royaraqamia.com`, `*.supabase.co`, Turnstile and `ws:`/`wss:` — not the
  audio host. `media-src` (line 14) already names it, which is why `<audio>` plays today and a
  `fetch()` for the same URL would be refused.
- The worker never sees any of this. Its fetch handler returns immediately for
  `url.origin !== self.location.origin`, so audio has always bypassed Cache Storage, and it still does.

## The decision, in six parts

1. **Fetch the host directly**, in CORS mode, at the same `?v=<sha256 prefix>` URL the player already
   uses. `connect-src` gains exactly `https://audio.royaraqamia.com` — one origin, not a scheme, not a
   wildcard.
2. **The worker stays out of it.** No cache rule, no same-origin path, no bypass list, no new event
   handler. ADR-0062's "never precached" and ADR-0069's byte budget are both untouched by this
   feature, and the worker's one invariant — same-origin only — keeps holding without an exception.
3. **OPFS first, Cache Storage as the fallback**, keyed `<edition>/<surah>/<ayah>@<sha256>` and sized
   from the manifest rather than from a response header. A republished file is a new hash, so it is a
   new key and a new download; an unchanged file is a hit.
4. **Playback from a local copy is a `blob:` object URL**, so `media-src` gains `blob:` alongside the
   host. That is the second and last header change, and it is the same scheme `img-src` and
   `worker-src` already allow.
5. **Nothing downloads through Vercel.** The download is a browser request to the CDN, so Hobby's
   Fast Data Transfer never carries it — ADR-0062's reason for moving the bytes to R2 in the first
   place.
6. **`navigator.storage.persist()` is asked for at the first download**, because both stores are
   otherwise ordinary evictable storage, and a reader who has been told a Surah is downloaded should
   not find it gone.

## Why not a same-origin path

This is the tempting one — it needs no CSP change at all, and the worker could then cache audio like
anything else — and it is rejected twice over, for the two ways of building it:

- **Through a Next.js rewrite, the way the APK install path is served.** Rejected: 820.56 MiB per
  Reciter crossing Hobby's Fast Data Transfer is exactly what ADR-0062 refused, and a bulk download
  would make that the site's largest traffic line.
- **Through a Cloudflare Worker route on `royaraqamia.com`, which the nameserver move makes possible.**
  Rejected: it puts a Worker in the path of every playback that is served by an edge-cached static
  object today, it has to reimplement Range streaming to stay seekable, and it converts free static
  reads into metered Worker requests — all to obtain a same-origin answer the bucket's CORS policy
  already gives.

## Why not let the worker store it

A cross-origin CORS response _is_ storable in Cache Storage, so this is not blocked, only worse:

- Cache Storage exposes no per-entry size, so a budget, an LRU order and a `/device` listing would all
  need a parallel ledger in IndexedDB — the same bookkeeping OPFS makes unnecessary.
- It collides with two settled decisions at once: ADR-0062's "never precached" and ADR-0069's single
  precache budget, which would gain a second, much larger pool its activation and purge logic does not
  understand.
- A `put()` of a whole response has no checksum step and no partial resume, so a dropped connection
  costs the Surah again; OPFS gets an append, a `sha256` verification and then a rename into the key.

## Considered options

- **Widen `connect-src` to `https:` or to `*.royaraqamia.com`.** Rejected: `connect-src https:` is a
  hole for any exfiltration endpoint, and the host is one origin — naming it is the whole cost.
- **Provide the local copy through a Service Worker `blob:`/`Response` and leave `media-src` alone.**
  Rejected: it needs the worker to intercept an audio URL, which is the invariant part 2 keeps, and a
  synthesized `Response` gives up Range on the local copy for no gain over a blob URL.
- **MediaSource with fetched chunks instead of `blob:`.** Rejected: a second media pipeline for MPEG-2
  Layer III, to avoid one CSP scheme the page already trusts elsewhere.
- **Proxy through Supabase Storage signed URLs.** Rejected: the same egress arithmetic ADR-0062
  settled, now with a token in the path.
- **Widen the bucket's CORS to previews so a deploy can be tested end to end.** Rejected: it puts a
  public download surface on every ephemeral preview host to save one test; localhost is already
  allowed, and `e2e` runs there.
- **Precache a default Surah at install so the first airplane is never empty.** Rejected: ADR-0062's
  "we hold no copy the reader did not ask for", and #559's own rule that nothing downloads without
  consent.

## Consequences

- The CSP gains two tokens and nothing else: `connect-src https://audio.royaraqamia.com` and
  `media-src blob:`. A test asserts both, so a later edit cannot quietly drop the origin and break
  downloads on the one host that works.
- **A CORS refusal and a missing network look alike to the page**, and the copy must not confuse them:
  on a preview host, "this needs a connection" would be a lie. The download affordance distinguishes a
  blocked origin from an offline device before it speaks.
- Previews and any future non-`royaraqamia.com` deployment stream but cannot download. That is a
  deliberate limit of the bucket's allowlist, not a bug to file twice.
- The manifest stays the only committed artefact: size and hash come from it, so the store never trusts
  `Content-Length` and a truncated response fails verification instead of entering the keyspace.
- A reader who never downloads sees no change: same URL, same `v=`, same `media-src` origin.
- ADR-0062's open bullet ("the offline download needs `connect-src` as well") is discharged here; its
  "never from Vercel" and "never precached" clauses are strengthened rather than amended.
- Airplane mode itself remains a device check, on ADR-0062's own precedent that the acceptance test is
  a phone in Syria and not a browser in CI.
