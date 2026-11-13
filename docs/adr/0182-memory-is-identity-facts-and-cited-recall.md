# 0182. Memory is identity, saved facts, and cited recall

## Status

Accepted (program). Schema and turn wiring land in phase 2; the settings surface follows.

## Context

`trimHistory` gives the model the last 20 messages, trimmed to a token budget. That is a window,
not a memory: on the twenty-first message the member reintroduces themselves.

The products that solved this did not pick one mechanism. They ship an explicit, user-visible
fact store — something the member can read, edit and delete — _and_ an implicit reference to
past conversation. The reason is that each one alone fails a different test. Facts alone never
remember what happened ("we already moved your budget to the 15th"); retrieval alone never
reliably knows the member's name, because a name is not a passage.

There is a third thing that is neither: the account's own row. Name, username, email, avatar,
plan. That should never be a tool call, never a guess, and never a retrieval — it is the session,
and it belongs in the prompt.

## Decision

**Three layers with different guarantees, and a visible control for each.**

1. **Identity is the session, not memory.** Before every turn the server projects the account row
   (name, username, email, avatar URL, plan, locale, timezone, connected-app count) into a system
   block. It costs no tool call, cannot be wrong unless the row is wrong, and is the same for
   every product. It replaces the "who am I" round the model used to spend a tool call on.

2. **Saved facts are rows the member owns.** `agent_memories(id, user_id, scope, product, kind,
text, source_turn_id, confidence, created_at, updated_at, deleted_at)` with
   `scope` in `account | product | thread`. Written two ways: by an explicit `remember` tool the
   member invokes ("remember that I prefer …"), and by an extraction step after the answer that
   writes only what passes a strict schema and a confidence floor. Both are visible on the
   memory page, editable and deletable.

3. **Recall is cited, bounded and degradable.** `agent_memory_embeddings` holds pgvector vectors
   over turn pairs, saved facts and thread summaries. Recall takes at most six items, applies a
   recency decay and a score floor, and injects each with its source ("من محادثتنا في 3 أكتوبر").
   An item below the floor is not injected. No key, no index or an error means lexical routing
   and no recall — never a failed turn.

4. **The window is summarised, not enlarged.** Once a thread passes `CHAT_AGENT_HISTORY_MAX`, a
   rolling summary is stored on the conversation and regenerated when ten new messages arrive.
   The window stays 20; the summary carries the beginning.

5. **Some things are never remembered.** Credentials, tokens, payment data, and any third
   member's data are refused at extraction. Health, legal and financial specifics are stored only
   when the member asks for them explicitly, with `kind` saying so. A memory is never inferred
   from a page snapshot (ADR-0181).

6. **The member controls all of it.** View, edit, delete, export, a per-scope toggle, and
   "forget this conversation". Deleting a fact deletes its embedding in the same transaction.
   Account deletion cascades.

7. **RLS is the boundary; the service role is not a read path.** A member reads and writes only
   their own rows. No admin policy, no product surface that reads somebody else's memory.

## Considered options

- **Facts only.** Rejected: it cannot answer "what did we decide last week".
- **Retrieval only.** Rejected: a name is not a passage, and a bad recall is indistinguishable
  from no memory.
- **Re-inject the whole transcript.** Rejected: cost grows quadratically and the window problem
  returns at a larger number.
- **Let the model decide what to remember, silently.** Rejected: memory the member cannot see is
  a privacy incident waiting for a support ticket.
- **Store the summary only.** Rejected: it is the third layer, not a substitute for the first
  two.

## Consequences

- Two tables, one index, one migration, and a cascade that the account-deletion path has to
  honour.
- Extraction runs after the answer is stored, so it never delays the stream; a failed extraction
  is a warning, not a failed turn.
- A per-turn cost line: one identity block, up to six recalled items, one summary.
- A new account surface (web and Android) that lists facts, grants and tasks together — the
  "what the agent knows" page in phase 6 starts here.
- The `remember` tool is the promise; a model that says "I will remember" without calling it is
  wrong, and the eval suite has a fixture for it.
