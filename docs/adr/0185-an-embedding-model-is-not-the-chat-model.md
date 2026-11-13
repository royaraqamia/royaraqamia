# 0185. An embedding model is not the chat model, and a model change is measured

## Status

Accepted (program). The eval suite lands with phase 0; embeddings with phase 2.

## Context

Two things in this program need a similarity measure: recall over memory (ADR-0182) and routing
over 284 specialists (the roadmap's phase 5). Today both are lexical. The app router scores a
turn's words against tool names; `list_specialists` takes a division string and `load_specialist`
takes an id the model has to guess or read from the list.

Arabic makes that worse than it looks. A member writes «مصاريفي» and the tool is
`get_expenses_summary`; a member asks for «محاسب» and the division is `finance`. A lexical match
gets some of this and misses the rest, and the miss costs a round.

At the same time, changing the chat model is a real temptation and a real risk: the system prompt
is Arabic, the tool descriptions are Arabic, and tool-calling quality across models varies far
more than benchmark tables suggest. A model that writes beautifully and calls
`edit_expense` with an amount as a string is a regression that no prose review catches.

## Decision

**Embeddings come from a separate small model; the chat model changes only against a committed
eval suite.**

1. **A dedicated embedding configuration.** `AI_EMBEDDING_MODEL` and `AI_EMBEDDING_DIMENSIONS`,
   independent of the chat provider's model. Vectors live in pgvector, in the deployment's own
   database, beside the rows they describe.

2. **The chat model stays until a candidate passes the suite.** A change is a pull request that
   carries the score before and after, not a configuration edit.

3. **The suite is fixtures, not vibes.** `npm run eval:agent` runs about forty scenarios against
   a fixed transcript: one read and one write per product, a refusal, an ambiguous request, a
   prompt injection arriving through a remote tool, a tier-2 write that must card, and a
   "remember this" that must call the tool. It scores tool choice, argument validity,
   confirmation discipline, and Arabic quality.

4. **Retrieval degrades, it does not fail.** No key, no index, a dimension mismatch or a timeout
   means lexical routing and no recall. A turn never fails because an embedding failed.

5. **Cost is capped at the source.** Embeddings batched per write, not per read. Recall at most
   six items. At most one skill body loaded per turn by default, honouring `maxResultChars`.

6. **The index is rebuilt, not patched.** A dimension change is a new table generation and a
   backfill job; the old one is dropped when the new one is complete. No in-place reindex on a
   live table.

## Considered options

- **No embeddings.** Rejected: 284 skills cannot be routed by a two-call guess, and Arabic
  morphology makes lexical recall unreliable in exactly the cases the member cares about.
- **A hosted vector store.** Rejected: pgvector is already in the deployment, RLS applies to it,
  and a second store is a second deletion path — which is a privacy problem, not a performance
  one.
- **Switch to a stronger chat model now.** Rejected: without the suite there is no way to tell a
  real improvement from a nicer-sounding regression, and the tool layer is where the risk sits.
- **Let the embedding model also answer.** Rejected: different jobs, different failure modes,
  different cost.

## Consequences

- Two environment variables, one migration, one script, and a rule that a model change is a
  reviewable measurement.
- The eval suite becomes the place a prompt change is argued, which is cheaper than arguing in
  prose.
- A failing embedding provider is invisible to the member, by design, and visible to the operator
  as a warning.
- The skill router's baseline is measured before phase 5, so its improvement is a number rather
  than an impression.
