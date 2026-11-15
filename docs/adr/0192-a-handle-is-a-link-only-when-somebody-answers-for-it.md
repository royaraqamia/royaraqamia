# A handle is a link only when somebody answers for it

The product writes text in a dozen places — a post body, a chat bubble, a note, a
bio, a card excerpt — and each of them was plain text with three exceptions that
already autolinked: a scheme URL in the rich-text editor, a scheme URL in a
rendered Markdown body, and nothing else. A member who wrote `example.com`,
`www.example.com`, `@sara` or `@نور` got the words back. In a community whose
whole point is that members have profiles and can be addressed, `@handle` was the
one address that never worked.

The tempting version — one regular expression and one anchor — gets the two
decisions that matter wrong. It links `v1.2`, `e.g.` and `node.js` as domains, and
it links a `@name` that names nobody.

## The decision

1. **One tokenizer, in `shared/text/linkify.ts`, and it is pure.** It names the
   spans — `text`, `url`, `mention` — and nothing else. Every surface renders
   through the same function, so a chat bubble and a post body cannot disagree
   about where a URL ends, and the answer is testable without a DOM or a network.

2. **A URL is a scheme or a `www.` host, or a bare host in a known TLD.** The TLD
   list is the price of not linking `node.js`; the alternative is a rule that
   turns every dotted word into a link, which is worse than missing `mysite.dev`
   until it is written with `www.`. Trailing sentence punctuation is trimmed, and
   a `)` that closes a `(` inside the address is kept — `/Foo_(bar)` is a URL.

3. **An `@handle` is a link only when the directory answers for it.** This is the
   one part a tokenizer cannot decide, so it is a second question, asked once per
   batch: `POST /api/users/mentions` takes up to fifty handles and answers the
   ones that name a verified, visible member. A handle nobody answers for stays
   the text the writer typed. A dead profile is worse than no profile: the reader
   cannot tell a typo from a deleted account, and the writer never learns.

4. **The answer is cached for the session, and every failure is "no".** Chat
   renders one bubble per message; a per-component lookup would ask about the
   same handle on every bubble. `useMentionHandles` keeps one module-scope map,
   batches the unknowns, and treats a failed request as "not a link" — which is
   the same thing the reader sees today, so an outage costs an underline and
   nothing else. The first paint is always the writer's text; the underline
   arrives when the answer does, and nothing reflows.

5. **A Markdown body is edited in the tree, not in the HTML.** `remark-mentions`
   runs on the mdast the renderer is about to draw, replacing a text node with the
   run of text and links it holds; it never enters code, code fences, raw HTML or
   an existing link. The post page resolves the body's handles with its own render
   — it is revalidated every five minutes, so the answer rides the same cache as
   the post.

6. **Typing a handle in a composer turns it into a link on the space after it.**
   The composer's Link extension already autolinks URLs; a mention needs the
   lookup, which is why it is done on the update rather than by an input rule —
   the document is re-checked when the answer arrives, so a link is never placed
   at stale offsets.

7. **A mention is isolated left-to-right.** In an Arabic sentence `@sara` is one
   left-to-right run inside a right-to-left paragraph, and without isolation the
   `@` migrates to the other end of the name (`sara@`). Links carry `dir="ltr"`
   and unknown handles are wrapped in `<bdi dir="ltr">`, so the two render the
   same shape.

## Consequences

- **The database did not change.** A mention is a link to `/u/<handle>`, not a
  relationship: there is no notification, no stored mention row, and quoting
  somebody does not add them to anything. That is a deliberate first step —
  notifications would need a write path that this change does not open.
- **An excerpt cut with `…` shows its last link as text.** `LinkifiedText` takes
  `truncated`, so a card or a note preview cannot offer a press that leads to
  half an address.
- **The note row became an overlay.** A note's row was a `<button>` and its
  preview now may hold a link; a link inside a button is not HTML, so the row is
  a button overlay with the preview stacked above it — the pattern the post card
  already used.
- **The resolver is a public read.** It answers only what the community directory
  already lists, and it is capped at fifty handles a call. It is not a
  notification system and it does not reveal hidden members (ADR-0127).
- **This is the shape for the next kind of inline reference.** A hashtag or a
  quote gets a token in `linkify`, a resolver if it needs one, and the same
  renderer; it does not get its own regex in its own surface.
