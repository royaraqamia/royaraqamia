# The 512 MB budget

The free Render instance is **0.1 CPU / 512 MB**. The CPU is the budget the edge work protects
(`docs/edge-cache.md`); this page is the other one. A single request that holds a large body has no
neighbour to share with, so the caps below are the difference between a slow answer and an OOM restart
that takes every open stream with it.

The Next server and Sentry are the floor. Everything here is what a request may add **on top** of
that floor; the numbers are ceilings, not reservations.

## What a request may hold

| Path                               | Ceiling                                                                                              | Where it is enforced                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Avatar upload (multipart)          | 5 MB + 64 KB overhead                                                                                | `readMultipartWithin` in `app/api/me/avatar/route.ts`              |
| Post image upload (multipart)      | 5 MB + 64 KB overhead                                                                                | `readMultipartWithin` in `app/api/community/media/route.ts`        |
| Chat attachment upload             | 25 MB                                                                                                | **client → Supabase Storage**; the bytes never pass through Render |
| Chat inline image (assistant turn) | 5 MB                                                                                                 | `ATTACHMENT_IMAGE_MAX` in `chat-agent-service.ts`                  |
| Chat document (assistant turn)     | 25 MB upload; 5 MB PDF; 1 MB per inflated entry; 2 MB across entries; 2,000 entries; 100k characters | `document-text.ts`                                                 |
| Concurrent document reads          | 1                                                                                                    | `withDocumentSlot` in `document-text.ts`                           |
| Optimized image (first hit)        | one decode at a time; 12 MP source; 2400 px stored edge                                              | `withImageDecodeSlot`, `IMAGE_MAX_PIXELS`, `imgOptMaxInputPixels`  |
| Exports, boards, feeds             | page-bounded reads; no whole-table materialisation                                                   | the query contracts                                                |

The multipart rows used to be unbounded before the controller's own `file.size` check: `formData()`
buffers the whole body first, so a body the edge let through was already resident. `readMultipartWithin`
counts the stream and refuses at the file limit plus a small overhead, before parsing. The peak while
the `Blob` is assembled is about twice the ceiling, which is why 5 MB is a safe number and 25 MB would
not be.

## The document reader

A chat document is downloaded only for the assistant turn that reads it, extracted to text, and
dropped with the turn (ADR-0140). The caps are about the extractor, not the bucket:

- **1 MB per inflated entry, 2 MB across entries.** A memo's `word/document.xml` is a few kilobytes.
  The check reads the size the archive's own directory declares, before JSZip inflates it, so a zip
  bomb is refused without the allocation it was built to cause. The old 8 MB ceiling was measured to
  add 166 MB of RSS for one document in this process; 1 MB adds roughly a twentieth of that.
- **5 MB for a PDF.** A PDF has no archive entry to budget: its object graph and embedded images are
  bounded by the file itself, so the reader refuses a larger file before PDF.js opens it.
- **2,000 entries**, so a directory with a million names is refused before the reader walks it.
- **1 concurrent read.** A second read queues rather than spending two halves of the 512 MB budget at
  the same time.
- **SAX events, not a DOM tree.** Memos and decks feed `Words` straight from parser events; workbooks
  and ODS build a compact element tree only for the attributes and subtrees they need. No reader
  holds a `fast-xml-parser` tree many times the size of its input.

A refused archive answers the existing "the document could not be read" sentence — no new copy.

## Residual risks

- **PDF.js on a PDF under 5 MB.** The page cap (20) bounds the text, not the file's object graph or
  its embedded images; the 5 MB file budget bounds the file. A larger PDF is an ordinary refusal.
- **`sharp` on a large source image.** Uploads refuse anything above 12 MP and store a copy whose
  longest edge is 2400 px, so a stored cover cannot ask libvips for more than 48 MiB of RGBA
  (#1787). The community cards and avatars draw that copy through `/api/media/optimize`, where
  `withImageDecodeSlot` lets one decode run at a time; other images keep Next's optimizer, bounded by
  the same number through `experimental.imgOptMaxInputPixels`. An image stored before the cap is
  passed through unchanged rather than decoded.
- **Concurrent paths.** A multipart upload and a document read can overlap; both are capped
  independently. The sum is what the memory graph watches.

## What the process reports about itself

`render.yaml` gives the **runtime** a 384 MB old-generation heap and the **build** its own 6 GB. That
split is the difference between a collection and a kill: a service-wide
`--max-old-space-size=6144` reached `next start`, and V8 — which collects against the limit it is
given — reported a 6,336 MB heap limit on a 512 MB container, so RSS crossed the wall long before
collection ran ([ADR-0199](adr/0199-the-heap-cap-belongs-to-the-build-and-a-restart-leaves-a-line.md)).
At 384 the reported limit is 576 MB: still above the container, but close enough that a full old
generation triggers collection while the instance is alive.

The log stream carries the two readings the dashboard graph would give:

- `[boot]`, once per start: the release, the commit, the instance, the RSS at start, the heap limit
  the process actually has, the previous start and how long that process had been running, and
  whether this start came off the same commit (`false` is a deploy, `true` is the same build coming
  back).
- `[memory]`, every five minutes: RSS, heap used and total, the heap limit, external memory, native
  buffers (`arrayBuffersMb`, a **breakdown** of external memory, not an extra bucket), `remainderMb`
  (RSS minus heap total minus external — the part a heap snapshot cannot show) and uptime.

A `heapUsedMb` that climbs toward `heapLimitMb` over hours is the leak question answered; one that
sits flat near the limit through an ordinary day is the plan question. The previous-boot fields need
`UPSTASH_REDIS_REST_URL`/`_TOKEN` and are `null` without them — local development and CI.

**Baseline recorded 2026-11-21.** Over the seven days to that date the app's `[memory]` samples put
RSS at p50 296 / p75 341 / p95 411 / max 425 MB, with `heapUsedMb` around 200, the live heap limit
259 and `externalMb` 35. Subtracting `heapUsed` and external from RSS gives roughly 190 MB, but that
overstates the unexplained part: RSS carries the whole V8 heap, not only the bytes in use. `[memory]`
now logs `heapTotalMb` and a computed `remainderMb` (RSS minus heap **total** minus external), which
will give the accurate figure on future boots; `arrayBuffersMb` only breaks down the external figure
and does not explain the remainder. Render's own memory metric over the same window was p50 313 /
p75 357 / p95 400 / max 449 MiB of a 512 MiB limit, and the origin OOM-killed three times. That is
the baseline against which the caps in this file are judged; it is not a second budget.

**The cap in this file is a blueprint intention, not a live fact.** Every boot line observed on the
origin in November 2026 reported `heapLimitMb: 259`, and the service's live environment does not
contain `NODE_OPTIONS` at all — V8 is using the limit it derives from the 512 MB container. Raising
it to the blueprint's 384 (a 576 MiB limit) while RSS already reaches 425 MB would let the heap grow
into the wall; on Free, do not "fix" this by applying the variable. Set it deliberately only after
moving to a larger instance.

## Early warning

`.github/workflows/memory-watch.yml` reads the memory graph and the restart events from the Render
API every six hours (`scripts/memory-watch.mjs`), and keeps one issue labelled `origin-memory`: it
opens on the first OOM restart, a p95 at or above 400 MiB, or one `[memory]` sample above 400 MiB,
edits the issue on each later warning, and comments and closes it when the origin is calm again. The
per-sample test matters because the 11-20 kill followed a 257 MB reading by 39 seconds — an averaged
graph would have missed the spike. `RENDER_API_KEY` is an Actions secret. The
script is read-only against Render and has no dependencies beyond Node's own `fetch`.

## When to buy the 2 GB plan

The `1c-2g` compute plan ($25) is the memory wall, not the CPU one. The trigger is evidence, not a
feeling: an OOM restart in Render's events, or a memory graph that sits above roughly 350–400 MB
through an ordinary day. In the seven days to 2026-11-21 there were three OOM kills (11-15, 11-16
and 11-20) and the app's own RSS samples reached 425 MB, so that trigger is met. The caps above are
the attempt to stay on Free; if a warning comes back after they land, buy the plan rather than
lowering the caps further. The $7 `0.5c-512mb` plan does not change this table — it only doubles CPU.

Watch **Render → service → Metrics → Memory**, the `origin-memory` issue, and Sentry for the
restart-shaped gaps. The edge verifier (`npm run check:edge`) does not cover this budget; it covers
the cache.
