# The assistant has a phase, not a typing line

[ADR 0165](0165-presence-is-a-per-member-stream.md), decision 7, gave نور one sentence: «نور تكتب...»
for as long as the member's turn ran. That was true when the assistant only answered in prose. It now
reads the member's own rows, searches a connected app, proposes a write, and waits for the member to
confirm it — and every one of those looked identical on screen. The site's floating panel did not draw
the sentence at all: it put «نور تكتب...» in the message body, as if it were the answer's first line,
and the header said only «نور». The app's sheet did the same, and its list row never drew a live line
for نور.

## The decision

1. **A phase is the model, not a string.** `ChatAgentPhase` is a discriminated union in
   `shared/contracts/chat.ts`: `thinking`, `writing`, `tool` (with the server's own present-tense
   label), `proposal`. The reducer derives it from the frames; no component guesses "is it typing?"
   from an empty string.
2. **A tool call is a lifecycle, keyed by the model's `call.id`.** The stream gains
   `tool_start { id, name, activity }` before the call runs, and `tool { id, name, label, ok }` when
   it closes. `activity` is present tense (what the header says now); `label` is the gerund the
   provenance line keeps. This is the shape OpenAI's Responses, Anthropic's `tool_use`, and the Vercel
   AI SDK all use: one identity, a start, and a result — not two unrelated notices. It is additive:
   an installed APK drops a frame it does not know, so it loses the start line and keeps the record.
3. **The header owns the live line.** The panel, the thread header, the sheet's title row and the
   chats row draw `phase → copy` from `shared/copy/assistant-panel.json`, one slot, height reserved
   so nothing jumps. The body no longer draws a placeholder bubble; it draws the answer when there is
   text, and the turn's reads fold under it as provenance («ما اطّلعت عليه»), not as a second live
   line. Header is present tense and transient; body is past tense and permanent.
4. **A proposal is "blocked on you", not activity.** It outlives the stream, so the header keeps
   «بانتظار موافقتك...» until the member confirms or declines. The list reads the same state from the
   server: `list_chat_threads()` now returns `open_actions`, the count of `proposed` rows, so a reload
   does not forget a decision. That is the one assistant fact that _is_ a table — it is the audit row
   ADR-0113 already keeps, not a presence fact.
5. **The turn outlives the sheet.** `AssistantTurnStore` (wired in `AppGraph`) runs the stream on a
   scope the graph owns and keeps one `AssistantTurn` per conversation. Closing the sheet no longer
   cancels the member's request, and the chats row can draw the phase while the sheet is closed. The
   store is not a cache of the answer: the thread's own read is the record.
6. **The app is the same pair.** `AssistantEvent` parses `tool_start` and the closing `tool`, the
   sheet and the row read the generated `AssistantPanelCopy` from the same source as the site, and the
   tool activity travels in the frame so neither client owns a second tool table.

## Consequences

- The live line is one sentence per client, and a new tool adds an `activity` string to
  `CHAT_AGENT_TOOLS`, never a branch in a header.
- `tool` now carries `id` and `ok`. The server emits a failed close too, so a refused read cannot
  look like a successful one, and the provenance line omits it.
- The list's needs-you state costs one scalar subquery per row in `list_chat_threads()`, backed by a
  partial index on `(conversation_id) where status = 'proposed'`.
- ADR 0165's point 7 is narrowed: the live phase is still the member's own turn, but the _open
  proposal_ is server state, because it is a write the member must act on rather than a transient
  fact about نور.

## Alternatives considered

- **Rename `tool` to `tool_start` and emit it before the call.** Rejected: the stream is append-only,
  so a phase change would mean re-sending the frame and teaching every reducer to merge instead of
  append; and losing the closing frame loses "ran" versus "failed".
- **One generic «تعمل...» for every tool.** Rejected: the tool table already carries the member's own
  words, and a line that says «تقرأ شهاداتك» is the difference between an agentic app and a spinner.
- **Keep the phase in the component that started the turn.** Rejected on both clients: the list is a
  different route, and the app's sheet is a modal whose scope dies on dismiss. The store is the only
  thing both screens can read.
- **Persist the live phase in Postgres.** Rejected: it is a seconds-long fact about the member's own
  request, and ADR 0165 already refused that shape. Only the proposal is durable, because it is
  already a row.
