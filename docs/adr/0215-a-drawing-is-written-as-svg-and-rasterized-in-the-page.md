# 0215. A drawing is written as SVG and rasterized in the page

## Status

Accepted. Landed with `assistant.render_visual`.

## Context

A member asks نور for a chart of their spending, a labelled diagram or an Arabic
poster. The assistant answers in text, and the deployment is a single free
Render Node service with 0.1 CPU, a 384 MB heap, no ffmpeg, no GPU and no native
binary (`render.yaml`, ADR-0126, ADR-0140). Generating a raster image on the
server would mean a second host and a new secret — the same wall that keeps
voice replies and photographic images out of this deployment.

Claude's custom visuals and artifacts take the other route: the model writes
HTML or SVG, and the viewer draws it. That is the only route this deployment can
honestly take today.

## Decision

1. **One tier-0 read tool, `assistant.render_visual`, owned by `assistant`.** The
   model writes a small SVG (12,000 characters) and an optional caption. It is a
   read: no third party sees the drawing, no money moves and no file is written
   outside the member's own thread. A tier above 0 would be a proposal card and
   would never run — the tier-1 grant executor does not exist yet (ADR-0180).
   When it does, this tool is the first one to become grantable.

2. **The SVG is sanitized on the server.** `backend/services/chat/visual-sanitize.ts`
   refuses anything that is not a static `<svg>…</svg>` and strips scripts,
   foreign objects, event handlers, `href` and remote `url(...)` references. The
   drawing is data the member sees, never code this deployment runs.

3. **The page rasterizes; the server does not.** The client draws the SVG into a
   canvas at twice its natural size and exports a PNG for display. This is the
   "code to PNG behind the scenes" the product promised, at zero server cost and
   with no new host or credential.

4. **The spec, not the PNG, is stored.** `chat_messages.visual_svg` is a nullable
   unindexed JSON render payload, written only on the assistant's own rows. A
   thread reopened tomorrow rasterizes the same stored SVG the same way. A
   member's own rows never carry it.

5. **Arabic stays in the app's hands.** The model writes SVG text; the renderer
   uses the page's own fonts (IBM Plex Sans Arabic, Aref Ruqaa for digits), so
   shaping and the ASCII-digits rule are the ones the rest of the site enforces.
   There is no font file in a worker to drift.

## Why not the alternatives

- **A native image model on the server.** The gateway serves chat models only
  and has no image-generation route; a second vendor is a paid decision for the
  owner, not a feature of this change.
- **A rasterizer on the server.** No ffmpeg or browser exists on the free Node
  service, and adding one changes the deployment's cost and footprint.
- **Live HTML artifacts in chat.** Claude's custom visuals do not render on
  mobile. Our Android shell is a WebView of the same document, so a PNG in the
  message is the only shape both clients can show today.
- **Storing the PNG as an attachment.** The server cannot produce it, and an
  upload from the client would make the member the uploader of a drawing the
  assistant made.

## Consequences

- A chart, diagram or Arabic poster appears in the chat as an image; the member
  can reopen the thread and still see it.
- The drawing is not a native port. Both clients render the same document
  surface; `docs/mobile/parity.json` needs no new row and no Android release note.
- A malformed or unsafe SVG becomes one Arabic sentence, not a broken turn.

## Amendment 2026-11-28: motion on the origin (#1776)

The premise above retired with the free Render instance. The origin is the
self-managed VPS (ADR-0221), whose Docker image is built in GitHub Actions, so
the deployment can carry a binary the old one could not: `ffmpeg` ships in the
runtime image, and `sharp` — already an npm dependency — paints the frames. No
new vendor, no GPU and no browser join the deployment.

- **The model still writes one SVG, now with optional bounded motion.** A
  `VisualSpec` may carry `animation`: a duration (400-6000 ms), a frame rate
  (4-12 fps), and up to eight tracks. A track names an element `id` that the
  sanitizer kept and declares at most twelve keyframes of `x`, `y`, `scale`,
  `rotate` and `opacity`, all bounded numbers. `visual-sanitize.ts` is still the
  only gate the SVG passes; the motion adds no markup and no code.
- **The origin renders, the turn does not wait.** The still drawing is stored and
  drawn exactly as before. An animated spec is also queued in
  `chat_visual_renders`, and a per-minute `wake_visual_renders()` doorbell wakes
  `/api/cron/visual-renders`. The worker claims one row under a two-minute lease,
  paints each frame from the same sanitized SVG, muxes them with `ffmpeg` to
  H.264 MP4, stores the clip in `chat-attachments`, and writes one assistant
  message that carries it through the existing signed media route. The thread's
  Realtime subscription is what shows the follow-up.
- **The bounds are in code, not the prompt.** Frames are capped at 72, the
  canvas at 640 x 360, the encode at 30 s of wall clock, and the output at 8 MB.
  A spec the renderer refuses, or an encode that never settles, becomes the one
  Arabic sentence `VISUAL_UNAVAILABLE`; a transient failure is retried under the
  lease at most three times. `VISUAL_RENDER_REPORT=1 npx vitest run
backend/services/chat/__tests__/visual-render.test.ts` prints the frames,
  bytes and wall time of both the ordinary and the maximum clip, so the box's
  number is recorded rather than assumed.
- **The image carries one Arabic face.** librsvg draws `<text>` through
  fontconfig, so the runtime image ships `fonts-hosny-amiri`: a legible Arabic
  fallback for a clip, not the page's IBM Plex. The still image the page draws
  keeps the site's own face, exactly as before.
- **MP4 is the single output.** There is no WebM fallback and no in-page
  `MediaRecorder` promise: every Android WebView the shell runs can play H.264
  MP4, and both clients draw the same `<video>` the shared message list already
  renders.
