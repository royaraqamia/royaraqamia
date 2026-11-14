# The free instance has a memory budget

The free Render instance is 0.1 CPU and **512 MB**. ADR-0186 and ADR-0187 spent the CPU (a deploy
train and an edge cache); this is the other meter, and it fails harder: an OOM restart drops every
open assistant stream and every request in flight, where a slow render only waits.

Two paths made the risk concrete:

- **A multipart body before its file check.** `/api/me/avatar` and `/api/community/media` called
  `request.formData()` first and checked `file.size` afterwards. Cloudflare admits a 100 MB body; on
  this instance it was resident before any controller saw it.
- **A compressed archive before its text cap.** A chat document is read with JSZip and unpdf. The text
  was capped at 100k characters, but JSZip inflated `word/document.xml` first — a 25 MB upload could
  claim gigabytes of XML and the text cap would never be reached.

## The decision

1. **Refuse by the bytes that are about to be held.** `readMultipartWithin` reads the stream with a
   ceiling of the file limit plus 64 KB overhead, and both routes use it: 5 MB for an avatar, 5 MB for
   a post image. `Content-Length` is checked first when it is honest; the counted stream is the guard
   when it is not.
2. **Refuse an archive before inflating it.** The document reader reads each entry's declared
   uncompressed size from the archive directory and refuses over **8 MB per entry**, **16 MB across
   entries**, or **2,000 entries**. A normal memo is a few kilobytes; a package that claims megabytes
   of XML is not a document this instance should read.
3. **Two document reads at a time.** `withDocumentSlot` serialises the third; PDF.js holds the file and
   the XML parser holds a tree many times its size, so concurrency, not the per-file cap, is what
   actually bounds the peak.
4. **Leave the product ceilings alone.** A chat attachment is still 25 MB; it is uploaded **client →
   Supabase Storage** and never passes through Render. Only the assistant turn that reads it downloads
   the bytes, and only one turn at a time per document.

## The alternatives

- **Lower the 25 MB attachment ceiling.** It is a product promise, and the upload path already avoids
  the instance; the risk was the extractor, not the bucket. A format-specific refusal is cheaper than
  a smaller file the member can still send.
- **Stream every upload straight to storage.** The right long-term shape for avatar and post images,
  but the repositories take a `File`; changing that is a separate change with its own tests. The
  pre-buffer cap removes the OOM class now.
- **Buy `1c-2g` ($25) for 2 GB.** The correct move once there is revenue, and the documented trigger
  is a restart or a graph above ~350 MB. Paying before that hides which cap was missing.

## Consequences

- **A zip bomb is an ordinary refusal.** It answers the existing "the document could not be read"
  sentence, not a new error state and not a new piece of copy.
- **A very large document may be refused.** A memo with an 8 MB XML body is far outside what a chat
  turn needs; the reader would have stopped at 20 pages and 100k characters anyway.
- **A third simultaneous document queues.** With 5–10 people online that is rare; the alternative is
  spending the instance on a second parser.
- **The memory graph is the upgrade trigger.** Render → Metrics → Memory, plus Sentry for the gap a
  restart leaves. `npm run check:edge` covers the cache, not this budget.
