# The 512 MB budget

The free Render instance is **0.1 CPU / 512 MB**. The CPU is the budget the edge work protects
(`docs/edge-cache.md`); this page is the other one. A single request that holds a large body has no
neighbour to share with, so the caps below are the difference between a slow answer and an OOM restart
that takes every open stream with it.

The Next server and Sentry are the floor. Everything here is what a request may add **on top** of
that floor; the numbers are ceilings, not reservations.

## What a request may hold

| Path                               | Ceiling                                                                                         | Where it is enforced                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Avatar upload (multipart)          | 5 MB + 64 KB overhead                                                                           | `readMultipartWithin` in `app/api/me/avatar/route.ts`              |
| Post image upload (multipart)      | 5 MB + 64 KB overhead                                                                           | `readMultipartWithin` in `app/api/community/media/route.ts`        |
| Chat attachment upload             | 25 MB                                                                                           | **client → Supabase Storage**; the bytes never pass through Render |
| Chat inline image (assistant turn) | 5 MB                                                                                            | `ATTACHMENT_IMAGE_MAX` in `chat-agent-service.ts`                  |
| Chat document (assistant turn)     | 25 MB compressed; 8 MB per inflated entry; 16 MB across entries; 2,000 entries; 100k characters | `document-text.ts`                                                 |
| Concurrent document reads          | 2                                                                                               | `withDocumentSlot` in `document-text.ts`                           |
| Optimized image (first hit)        | one source at a time; edge-cached afterwards                                                    | `next/image` + `sharp`                                             |
| Exports, boards, feeds             | page-bounded reads; no whole-table materialisation                                              | the query contracts                                                |

The multipart rows used to be unbounded before the controller's own `file.size` check: `formData()`
buffers the whole body first, so a body the edge let through was already resident. `readMultipartWithin`
counts the stream and refuses at the file limit plus a small overhead, before parsing. The peak while
the `Blob` is assembled is about twice the ceiling, which is why 5 MB is a safe number and 25 MB would
not be.

## The document reader

A chat document is downloaded only for the assistant turn that reads it, extracted to text, and
dropped with the turn (ADR-0140). The caps are about the extractor, not the bucket:

- **8 MB per inflated entry.** A memo's `word/document.xml` is far below this. The check reads the
  size the archive's own directory declares, before JSZip inflates it, so a zip bomb is refused
  without the allocation it was built to cause.
- **16 MB across entries**, so a workbook cannot read five 8 MB sheets in one turn.
- **2,000 entries**, so a directory with a million names is refused before the reader walks it.
- **2 concurrent reads.** PDF.js holds the file and the XML parser holds a tree many times its bytes;
  a third read queues rather than doubling the peak.

A refused archive answers the existing "the document could not be read" sentence — no new copy.

## Residual risks

- **PDF.js on a 25 MB PDF.** The page cap (20) bounds the text, not the file's object graph or its
  embedded images. One such PDF at a time is the supported case; two are serialised by the concurrency
  slot.
- **`sharp` on a large source image.** The first request for a `next/image` variant pays the decode;
  the edge pays it once per variant. The allowlisted hosts are the source of truth for which images
  can arrive.
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
- `[memory]`, every five minutes: RSS, heap used, the heap limit, external memory and uptime.

A `heapUsedMb` that climbs toward `heapLimitMb` over hours is the leak question answered; one that
sits flat near the limit through an ordinary day is the plan question. The previous-boot fields need
`UPSTASH_REDIS_REST_URL`/`_TOKEN` and are `null` without them — local development and CI.

## When to buy the 2 GB plan

The `1c-2g` compute plan ($25) is the memory wall, not the CPU one. The trigger is evidence, not a
feeling: an OOM restart in Render's events, or a memory graph that sits above roughly 350–400 MB
through an ordinary day. Until then the caps above are what keep 512 MB honest, and the $7
`0.5c-512mb` plan does not change this table — it only doubles the CPU.

Watch **Render → service → Metrics → Memory**, and Sentry for the restart-shaped gaps. The edge
verifier (`npm run check:edge`) does not cover this budget; it covers the cache.
