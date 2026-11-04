# A turn is a row

The assistant's turn lived only as long as its request. A 55-second budget, one attempt, and a
failure that ended with a sentence — and worse, a failure in a later tool round threw away the text
the member had already read, because the stream ended and the composer cleared itself.

Two questions were tangled: what a turn leaves behind, and who is allowed to finish one. This records
the first, and the one boundary the second must respect.

## Decision

**A turn is a row.** `agent_turns` is written before the provider is called and ends in one of three
states: `running`, `settled`, `failed`. It carries an attempt count and, on failure, the text that had
already streamed.

1. **One retry, and only a clean one.** A second call is made when nothing has streamed, no tool has
   run, nothing has been proposed and the provider's refusal is worth repeating — a rate limit, a
   5xx, a socket that died. A billing wall is not. Repeating a call that already wrote text would
   print the same paragraph twice, so it is refused by construction rather than by discipline.
2. **What streamed is kept.** The row holds it, and the composer keeps it on screen under «توقّف الرد
   قبل أن يكتمل» instead of clearing the bubble. It is deliberately _not_ stored as the assistant's
   reply: a truncated answer that reads like a whole one is worse than none.
3. **No session is stored.** The obvious way to let a worker finish a turn is to copy the member's
   session onto the row. That is the failure ADR-0023's amendment fixed: refresh-token rotation is
   single-use, so the worker's refresh invalidates the browser's token and the member is signed out.
   A worker mints its own session, or it does not run.
4. **The row is the seam for that worker.** `running` is the only state a resumer needs to look for,
   which is why the partial index exists before the resumer does.

The table is `service_role` only and has no policy: the member reads their answer in `chat_messages`,
where the policy already is, and a turn is diagnostics rather than surface.

## Consequences

- A turn that dies leaves evidence: how many attempts, how far it got, and why it stopped.
- The allowance is still released on failure — the row is not a billing record, and a turn that
  produced nothing must not spend the day's count.
- The row is small and bounded (`partial_text` is capped at 20 000 characters, `error` at 500), so a
  sweep can prune it later without deciding what a member would miss.
- A retry adds up to one provider call per failed turn. At the allowance's 40 turns a day that is a
  bounded cost, and the alternative — a member re-asking by hand — costs the same call plus a turn.

## Alternatives considered

- **Copy the member's session onto the row.** Rejected above; it signs people out.
- **Retry the whole turn.** Simple, and it duplicates every streamed token the member already saw.
- **Store the partial text as the reply.** Makes the thread look complete when it is not, and the
  member would quote a sentence the model never finished.
- **A queue in front of every turn now.** The right shape eventually, but it needs minted sessions and
  a worker before it earns its keep; a row and a retry capture most of the reliability loss today.

## Amendment: the worker, and how it is allowed to act

The row was written to be claimed later, and it now is. A turn whose request died is finished by
`/api/internal/agent-turns/run`, woken once a minute by `wake_agent_turns()` (pg_cron → `net.http_post`,
the same door the habit reminders use). Nothing runs when there is nothing abandoned, and the
doorbell no-ops until its two Vault secrets exist.

Three rules keep the worker honest:

1. **The lease is the claim.** `claim_agent_turn` is one conditional update — `running`, fewer than
   three resumes, and its lease expired — so two wakes cannot write two answers. A worker that dies
   mid-answer leaves a lease that expires, and the next wake retries it; after three it stops.
2. **The session is minted, not borrowed.** `openAgentTurnSession` mints an independent Supabase
   session for the member (the MCP server's own magic-link pattern), runs the turn under RLS with it,
   and signs it out afterwards. Nothing is persisted, which is why the table has no session column.
3. **It takes nothing.** The member's message is already in the thread and the count was already
   reserved; a resumed turn only writes the answer and settles the row.

One turn per invocation, because a turn caps at 55 seconds and the route's ceiling is 60; a backlog
therefore drains one turn a minute, which is the only situation that produces a backlog.
