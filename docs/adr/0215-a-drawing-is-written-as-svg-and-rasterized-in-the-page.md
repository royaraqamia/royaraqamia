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
- Video needs a separate decision: browser `MediaRecorder` and WebCodecs exist,
  but MP4 support varies by WebView version, so code-animated MP4 stays a later
  change rather than a promise this one cannot keep.
