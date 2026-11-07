# The assistant loads a specialist by tool, not by prompt

Date: 2026-11-07
Status: Accepted

## Context

The terminal and the Telegram bot load the vendored agency roster straight from
`.opencode/skills/agency/` (ADR-0136's tree, installed in #1130). The product
assistant is not an OpenCode session: `chat-agent-service.ts` owns its own prompt,
its own provider loop and its own typed tools, so nothing is inherited.

Every door can now pick a specialist from context without the member naming one.
For the assistant that must not mean putting 283 descriptions in the system
prompt: measured at 221 characters each, that is ~15.6k tokens on every public
message, most of which are about a certificate or a booking.

## Decision

Two read tools, `list_specialists` and `load_specialist`, over one reader
(`backend/services/chat/agency-skills.ts`):

- with no division, `list_specialists` returns the division index and counts;
- with a division, it returns that division's ids, names and descriptions;
- `load_specialist` returns one prompt body, with its tool answer bounded at
  20,000 characters instead of the service's 4,000, because a prompt is a
  document rather than a record.

The model decides when to look, exactly as it does in the terminal, and a turn
that never needs a specialist pays two tool descriptions. `next.config.js` traces
`.opencode/skills/agency/**` into `/api/chats/**` so the function ships the same
files the checkout reads; an id is validated against the index and never joined
into a path.

## Consequences

- One copy of the roster, read by all three doors; the assistant cannot drift
  from what the terminal sees.
- The roster is public content (MIT, on GitHub), so loading it adds no new
  exposure; what the member sees is still their own data through their own client.
- A cold function reads 283 frontmatters once per instance to build the index;
  the directory is ~4.2 MB, inside the function's size budget.
- `agency-roster` stays out of the index: it is the OpenCode view of the same
  set, not a specialist the assistant should load.
