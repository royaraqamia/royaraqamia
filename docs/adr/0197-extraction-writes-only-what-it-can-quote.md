# Extraction writes only what it can quote

#1511 asks memory to fill itself after the answer, and the first draft of that
sentence was easy to read two ways: "extraction runs after the answer" could mean
a second writer with its own rules, and "strict schema" could mean a prompt that
asks the model to be careful. Both readings fail the same test. A fact nobody
typed is the one row a member cannot explain, and a prompt is a wish — the same
argument that made `memoryRefusal` a function instead of an instruction (ADR-0182,
decision 5).

## The decision

1. **Extraction is a caller, not a writer.** It offers facts to `remember` and
   nothing else, so the refusal list, the normalisation, the duplicate answer and
   the vector stay in one place. A second insert path is how the page and
   extraction start rendering shapes the other wrote.

2. **A floor, in the domain, at 0.8.** Below it nothing is written at all — not
   stored and hidden. The errors are asymmetric: a false positive leaves a row the
   member has to find and delete, a false negative costs a sentence they can
   repeat. The accepted score rides on the row (`confidence`), so the floor is
   re-derivable from history rather than re-guessed, and changing it is a
   measurement (ADR-0182 decision 3 makes the same argument for the recall floor).

3. **A sensitive fact needs the member's own sentence.** For `health`, `legal` and
   `financial` the extractor must return an `evidence` span, and the parser looks
   for it in the member's message — not the answer, not the history. No span, no
   fact; never downgraded to `kind: 'fact'`, because a fact whose kind is wrong is
   worse than no fact and the issue forbids repairing. This is what stands in for
   consent, which the `remember` tool has and extraction does not.

4. **The turn is the authority, not the caller.** Extraction takes a branded
   `SettledTurn`, built inside the turn from its own ids, and `source_turn_id`
   cites it. It runs on the service role because a background task has no member
   session; what keeps that from naming somebody else is the input, which cannot
   carry a member id at all.

5. **One attempt per turn, claimed in the database.** `agent_turns.extracted_at`
   is written by a single conditional update before the provider is called, so a
   rescheduled instance and a resumed worker cannot both pay. A failed attempt
   keeps the claim: the issue forbids a retry inside the turn, and the partial
   index on `(settled_at)` leaves a later sweep possible without a schema change.

6. **Scheduled behind the answer, never awaited.** The turn hands the task to a
   `DeferredWork` seam; the composition root passes `after()`, so the instance
   survives until it settles. A failure of any kind is one warning — provider,
   timeout, schema, database — and the member's answer is already stored and the
   turn already `settled`.

7. **Off by default.** `MEMORY_EXTRACTION` switches it on. It is a provider call
   on every turn that nothing else pays for and it writes rows on the member's
   behalf, so it is turned on by a decision that can point at a measurement, not
   by a merge.

## Consequences

- The memory page (#1428) is where a member sees these facts; until it lands,
  phase 2's first acceptance sentence is provable through `remember`'s own rows
  and the thread, not through a screen.
- `AiChatClient` gains `reply`: extraction has nobody watching the words arrive
  and would only parse a stream back together.
- `DeferredWork` moves to `backend/shared`, because the chat turn and the link
  redirect now share it and neither may import the other's service.
- One extra provider call per turn when switched on, bounded at 6 s and three
  facts; `#1455` is where that line is measured against the memory it buys.
