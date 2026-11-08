# An image is a prompt, so the page bounds it

Date: 2026-11-08
Status: Accepted

## Context

The assistant learned to read a file in #1042 (ADR-0127): up to five files per
turn, each reaching the model as what it is — a recording as its transcript, an
image as an image part, a text file as text. What that left open is the picture
itself. The composer accepted whatever the picker returned, so a phone photo went
up at 8–12 MB and 4000 px wide, was stored at that size, and was then refused by
the service's own 5 MB ceiling on the image part — after the upload, as one
sentence, having spent the bytes. A picture small enough to pass cost a base64
copy inside the request body on every round of the turn, and the thread drew the
result as a download chip with a file name: the member attached a screenshot and
could not see it.

## Decision

1. **The page shrinks the picture before it uploads it.**
   `frontend/ui/chats/image-downscale.ts` decodes the file with the browser's own
   decoder, keeps the longest side at 1600 px (`CHAT_IMAGE_LONGEST_SIDE_PX`) and
   the bytes under 4 MB (`CHAT_IMAGE_MAX_BYTES`) — WebP first because it keeps an
   alpha channel and is smaller, JPEG on white when the encoder has no WebP. The
   name follows the bytes (`shot.png` becomes `shot.webp`). An image already
   inside both bounds is uploaded untouched: a second lossy pass on a small
   screenshot buys nothing. A file the browser cannot decode (HEIC on most
   desktops) is uploaded as it is, and the server's sentence — "I cannot read
   this file" — is the answer, because dropping it silently is worse.
2. **Three pictures per turn.** `CHAT_AGENT_IMAGES_PER_TURN_MAX`, counted by
   MIME through `chatTurnImages` so the composer
   (`exceedsImageLimit`) and the contract (`ChatAgentTurnSchema`) count the same
   thing: refusals before the upload in the page, and in the route before any
   allowance is reserved. The file ceiling stays ADR-0127's five, because a text
   file or a recording is read once and is not a part the model re-reads on every
   round; the picture bound is the one number this decision adds.
3. **The typed question rides with the reading.** A turn with parts used to send
   the parts and drop the words, so "what are the totals?" over a screenshot
   asked the model to guess what it was looking for. The typed question is now a
   `text` part ahead of the files' parts; a turn with nothing but words stays the
   string it always was.
4. **The picture is drawn where it sits.** `chat-image.tsx` asks for the bytes
   through the same reader a chip uses (#1033: the device's copy when it has one,
   the server's signed URL otherwise) and draws them in the bubble, so what the
   member sees is what the model read. The chip stands in until the bytes arrive,
   and stays if they never do — a picture that will not load is still a file that
   can be opened. The download sentence stays in `chat-thread-view.tsx`, because
   `chat-thread.json` is that file's copy (ADR-0098).
5. **History stays text.** `trimHistory` joins bodies, so an image from an older
   turn is drawn in the thread and never re-sent to the model. A picture costs
   its bytes on the turn that carries it and nothing afterwards.

## Consequences

- A screenshot of a table is legible at 1600 px and costs tens of kilobytes, not
  megabytes: the upload, the stored object, the base64 part and the provider's
  bill all shrink together.
- The bucket's 25 MB per-file ceiling and the service's 5 MB image ceiling stay
  as backstops for a client that does not run the page's code; they are no longer
  the path a screenshot takes.
- Three images at 1600 px are about 0.5–1.5 MB of base64 in one request body,
  which the gateway's measured image input already handled at probe time.
- A thread with pictures mints one signed URL per picture as it paints, cached
  to the device by the media cache after the first read — the same trade the
  voice-note player makes, and the reason both are asked for on demand.
- The four-file turn still works: a member can send three images and a text file,
  and the text file arrives as text while the pictures arrive as parts.

## Alternatives considered

- **Let the server shrink the image.** The provider limit is what fails, and
  refusing after the upload spends the bucket bytes to find out. The page already
  knows the dimensions before it sends anything.
- **Keep the 5 MB image ceiling as the only bound.** It is a refusal, not a
  bound: it answers a phone photo with a sentence instead of reading it.
- **Re-encode every image, even a small one.** Uniform output, and a screenshot
  that was already readable loses detail for nothing.
- **Send images as signed URLs instead of data URLs.** Smaller request bodies,
  and the gateway expects the image inside the message; a URL would need the
  provider to fetch the member's private bucket.
- **Keep the chip and let the member open the file.** The original issue's whole
  point is that a picture should be answered about without being described
  first; a file name in the thread hides the very thing they asked about.
