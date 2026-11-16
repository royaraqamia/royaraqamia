# A memory generation follows its provider's width

ADR-0190 put this deployment on Cloudflare Workers AI `@cf/baai/bge-m3` for embeddings and, in its
decision 4, left memory where it was: "the artifact declares 1024; `agent_memory_embeddings` is 1536
and stays so". That was the right call for the change it was making — the shortlist needed a client of
its own width, and a dimension change is a new table generation (ADR-0185 decision 6), not a
side-effect of routing work. It was not the right place to stop.

The cost of stopping there was total. `createAiEmbeddingsClient()` with no options read
`AI_EMBEDDING_DIMENSIONS` against the generation's width, found 1024 against 1536, and answered
`null` — by design, because a vector the index cannot hold must not be written. So `createAgentRecallFor`
returned `[]` on every turn, the write path never stored a vector, and memory was lexical by absence
rather than by choice. The recall service was complete, tested, and never ran once in production.

## The decision

**A memory generation is rebuilt at the width its provider answers, and it keeps its own name.**

1. **A new pair, not a reindex.** `agent_memory_embeddings_1024` and `agent_memory_nearest_1024` are
   the generation: `vector(1024)`, the same one-vector-per-fact constraint, the same cascade from
   `agent_memories` and `auth.users`, the same owner-only policy and grants, the same HNSW index, and
   the same per-scope switches. The width is in the name because it is the generation; two widths in
   one table would be two vector spaces in one index, which is what ADR-0185 decision 6 exists to
   prevent.
2. **The work list moves with it.** `agent_embedding_pending` keeps its name and its meaning — a live
   fact with no vector, or a vector older than the fact — and now asks the new table. That is what
   makes `npm run embeddings:backfill` idempotent across a generation change: every fact the old table
   held is queued once, a written row leaves the view, and a second run embeds nothing.
3. **Forgetting covers both, until the old one is gone.** `agent_memory_forget` and
   `agent_memory_forget_thread` delete from both tables. The member's promise is that the vector is
   gone, not that it is gone from whichever table the code reads this week.
4. **The code names the generation once.** `EMBEDDING_GENERATION` carries the table, the function and
   the width, and the repository addresses all three through it. With the widths equal,
   `createAiEmbeddingsClient()` builds a client instead of reporting a mismatch, and recall accepts
   the turn's shared vector — the same vector the specialist shortlist just paid for — instead of
   dropping it.
5. **The drop is separate, and human.** The 1536 table and its function stay readable after this
   change. Dropping them is a later migration, written once the backfill reports `done`, and it needs
   a person: the apply gate refuses destructive DDL unattended, which is exactly the review that
   change deserves.

## The alternatives

- **Reindex the 1536 table in place.** Refused by ADR-0185 decision 6, and for a concrete reason: the
  old table keeps answering while the new one fills, so an embedding provider failure during the
  change costs a degraded turn rather than a half-converted index.
- **Buy a 1536-wide embedding model instead.** ADR-0190 already weighed this: a second billing
  relationship for about $0.006 a month, against a token on an account the deployment already has.
  Memory would have kept its width and the deployment would have gained a vendor.
- **Read both generations during the transition.** A `union` of two nearest functions would make
  recall correct in the gap at the cost of two indexed searches, a second ranking input, and a code
  path that exists only to be deleted. The gap is a backfill run, and the old table is empty in this
  deployment anyway: the client answered `null` before this change, so nothing was ever written.
- **A width-agnostic column.** pgvector's index needs a width at DDL time; a `vector` without one
  cannot be indexed, so "any width" is "no nearest-neighbour search".

## Consequences

- **Recall runs.** A saved fact is recalled by what it means on the deployment's own model, which is
  the first time that sentence is true rather than planned.
- **One warning still covers the mismatch case.** A deployment that configures another width gets no
  client, lexical recall, and the one operator line — the behaviour that made the mismatch visible
  here instead of silent.
- **The frozen generation is a scheduled drop.** Until it lands, one extra table, one unused function
  and two extra deletes per forget. The tracking issue for it names the backfill evidence the drop
  waits on.
- **A future model change is the same shape.** A provider of another width means another table, another
  function, another backfill and another drop — the recipe is now one that has actually been run.
