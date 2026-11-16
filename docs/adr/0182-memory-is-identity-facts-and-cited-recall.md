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

## Amendment (2026-11-15, #1529): the summary is not a recall source

Decision 3 names three sources for `agent_memory_embeddings`: turn pairs, saved facts and thread
summaries. Only the second exists, and the third should not. This amendment takes the summary out
of the list; the turn pair stays out until its cost is measured, in the direction described below.

What landed instead is decision 4's summary: a block in every turn's prompt, read from the
conversation row and regenerated every ten new messages past a message-id cursor
(`backend/shared/domain/conversation-summary.ts`, #1512). It is **context**, not memory, and the
distinction is the decision.

**Why a vector of it cannot be a recall source.**

1. **It is derived from the thing already in the prompt.** A similarity search over summaries
   returns the summary — content the turn already holds, ranked. Compression that dropped a
   decision cannot be undone by indexing what survived it; the index adds no information to the
   block, only a second copy of it.
2. **A summary is a state; an index wants events.** Each regeneration replaces the text, so the
   table would hold superseded states at equal confidence: "the budget moved to the 15th", and four
   hundred messages later "the budget moved to the 1st". Similarity cannot tell which is current,
   the floor cannot, and the recency decay only tilts a ranking — it cannot suppress a reversed
   decision that matches the question better. Recall would then cite the older one, which is worse
   than citing nothing.
3. **There is nowhere to recall it from.** A member has one assistant conversation
   (`private.enforce_one_agent_thread()`, `20261112160000`), so every summary in the deployment
   belongs to the thread the turn already has open. A cross-conversation read would need many
   topical threads, or summaries over human conversations — a product change, not an embedding one.
4. **Prose is not citable.** Decision 5 and #1512 both draw the line, and it is the same line: a
   cited item never comes from prose. A paraphrase the server wrote must not become the source of a
   decision.

**The cost the program stops carrying.** `agent_memory_embeddings.memory_id` stays `not null` with
its `unique (memory_id)`: no nullable foreign key on a table that already holds live rows, no second
`conversation_id` FK, no exactly-one-source check, no second cascade for "forget this conversation"
and account deletion, and no HNSW insert-and-delete churn every ten messages for a row derived from
one the turn already read. `agent_embedding_pending` keeps one branch and `EmbeddingSourceKind`
keeps one member. The comment in `20261203120000_agent_memory_embeddings.sql` that names the summary
as the next source is superseded here; the file itself stays as applied.

**What would reopen it, and in which direction.** Long-thread memory past the summary's ceiling is
a real limit. The unit that can answer it is the **turn pair** — an exchange that keeps its own text
and its own date — not a summary version that supersedes itself. If a measurement ever shows the
ceiling being hit (a member asking for something the summary dropped), the source is the exchange,
embedded when it is written and cited as «من محادثتنا في 3 أكتوبر». That is a cost decision of its
own — one vector per exchange instead of one per ten messages — and it needs the eval before it
needs the table.

## Amendment (2026-11-16): one switch, not one switch per scope

Decision 6 lists "a per-scope toggle". What shipped (#1428) was three switches over
`account | product | thread`, and two of them — «على كل المنتجات» and «في المنتجات» — said almost the
same thing in two words. The difference between those scopes is where the server routes a fact, which
is not a decision the member can see or predict; the page therefore showed a settings card with a
dial that moved something invisible.

The page is now titled **«ذاكرة نور»**, the same string the account row carries, and it draws **one**
switch that writes all three booleans together. A scope appears only as a heading over the facts it
holds («عنك»، «عن المنتجات»، «عن المحادثة»), and the control that acts on a single fact stays the
button on that fact's row: edit or forget. Decision 6's promise is unchanged — view, edit, delete,
export, a switch and "forget this conversation" — and the promise that matters is the one the switch
was standing in for: a member can stop the assistant remembering at all without losing the facts
already saved, because they stay listed until deleted.

The store keeps three booleans. The route still accepts a partial patch, so a scope can be closed on
its own if a surface ever needs it; the two clients' single switch simply names all three, and reads
"on" only when every scope is open.

**What would reopen it.** A product surface that wants to close one scope alone (say, conversations
but not account facts) and can explain, in the member's words, why the two differ. Until then the
three headings are the only place a scope is named.
