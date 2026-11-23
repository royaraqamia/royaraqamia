# 0216. Member-paid capabilities ride the connected-app seam

## Status

Accepted. Landed with the Higgsfield connector and inline image/video in the chat thread (#1775).

## Context

نور can read a pasted link (ADR-0214) and draw a small SVG (ADR-0215), but she cannot produce a
photographic image or a generated video clip. The deployment is one small Node service with no
GPU, no ffmpeg and no image model behind its chat gateway; buying those would mean a second host,
a new vendor and a bill this project did not agree to pay.

Claude already has the capability through the Higgsfield MCP connector at
`https://mcp.higgsfield.ai/mcp`: the member signs in with their own account, every generation
spends their own credits, and the server publishes OAuth with dynamic client registration. It is
not in the official MCP registry, so the mirror in `mcp_catalog_servers` would never offer it on
its own.

The owner's decision is narrow: this is allowed **only if it costs us nothing**. The deployment
must never hold a Higgsfield key, must never pay a Higgsfield bill, and the member's account and
credits stay theirs. Everything already needed for the seam exists — the connected-app
marketplace (ADR-0155), OAuth 2.1 with DCR and encrypted tokens in
`mcp_connection_credentials`, per-connection `permission_level`, a card before any write, and the
`mcp.call` meter. What was missing was the row, the render payload and the file's route into our
own storage.

## Decision

1. **We hold no key and pay no bill.** Higgsfield is a curated catalogue row the daily mirror
   preserves before its delete sweep, not a row fetched from the registry. It declares
   `auth_mode: oauth`; discovery, registration, PKCE and the token all belong to the member's
   own connection. There is no environment variable, no deployment secret and no line in
   `render.yaml`. The member's credits, consent and account are theirs.

2. **A generation is a write, and a write is a card.** The connection's `permission_level`
   defaults to `ask` in the database and never to `all` — the member may widen it per app, and
   an inference about a stranger's tool never does. A generation tool is therefore proposed
   before it runs unless the member already chose `all` for that app; `readOnlyHint` is the only
   automatic pass, and it is the server's own claim, not ours.

3. **The bytes are fetched by the server and stored in our bucket.** A connector may answer with
   a link to the file it produced. The assistant resolves that link through
   `backend/clients/mcp-remote` — the one module that speaks to a third-party server — with the
   member's own encrypted token and the same egress policy a tool call uses. The bytes go into
   the existing private `chat-attachments` bucket through the service role; the object and its
   daily sweep are owned by the policies that already govern every other attachment.

4. **The message carries a descriptor, never a vendor URL.** A new nullable `chat_messages.media`
   column holds `{ kind: 'image' | 'video', url, mimeType }`. `url` is a same-origin route that
   checks conversation membership on every read, pins the storage path to that conversation, and
   mints a one-minute signed URL. No vendor token and no vendor link reaches the browser, and a
   file that vanishes at the vendor still plays from our bucket after a reload.

5. **A `media` stream frame draws it in the thread.** The frame and the stored row carry the same
   descriptor, the way `sources` and `visual_svg` do. The page uses native `<img>` and `<video>`
   elements; the Android shell is a WebView of the same document, so there is no native port, no
   `docs/mobile/parity.json` row and no Android release note for a screen that did not move.

6. **A refusal is one Arabic sentence, not a broken turn.** Spent credits, a vendor refusal, a
   broken link or a file that is not renderable produce one sentence in the text answer. The
   words the model wrote stay; the media does not appear, and no error card or vendor text is
   shown. A file is an addition to the answer, never the answer itself.

7. **The free lane is untouched.** A drawing the assistant writes in code is still a sanitized
   SVG rasterized in the page (ADR-0215). It is not a connected-app capability, does not spend a
   member's credits, and never becomes media. This decision buys only what the member already
   pays for somewhere else.

## Why not the alternatives

- **A native image or video model on our service.** A second vendor, a second host and a bill we
  did not agree to. ADR-0215 rejected the same shape for rasterizing; the reason is stronger when
  the capability itself is paid.
- **Ship the vendor's URL to the browser.** It dies on the vendor's schedule, it can carry a
  credential, and it makes a member's private generation depend on a third-party link staying
  alive. Our bucket and a same-origin route make the file ours to serve.
- **Store a long-lived signed URL in the row.** A signed URL expires; a thread reopened tomorrow
  would show a broken element. Minting one on each read keeps the descriptor stable and the URL
  worthless once copied.
- **Default the connection to `all`.** A generation spends money, and no inference about a
  stranger's tool may decide that on the member's behalf. `ask` is the database default; widening
  is the member's act, per app.
- **A native assistant-sheet port.** The thread is one document in both clients. A second
  renderer would need its own visual gate and its own copy, and would show a different file than
  the site.

## Consequences

- One curated catalogue row, one migration (`chat_messages.media`), one route and one render
  payload. The generated database types, the shared contract regenerated to Kotlin and the
  `chat_attachments` bucket's own RLS are the only wider surfaces.
- Every media call spends the existing `mcp.call` allowance and obeys the three-calls-per-turn
  valve; a card declined spends nothing, as it did before.
- The capability registry is unchanged. A member-paid connector is not a capability our MCP
  server declares, so `docs/assistant/capabilities.md` and `check:capabilities` stay untouched.
- `check:parity` needs no new row and `check:copy` needs no new string: both clients read the same
  document, and the two Arabic alt labels live in the shared contract rather than a one-sided
  copy file.
