# 0190. The embedding provider is its own credential, and the roster's vectors are a file

## Status

Accepted. Amends [ADR-0185](0185-an-embedding-model-is-not-the-chat-model.md) decision 1; lands with
phase 5 ([#1448](https://github.com/royaraqamia/royaraqamia/issues/1448)).

## Context

ADR-0185 decision 1 put the embedding model on "the same OpenAI-compatible endpoint and key as the
turns". Measured on this deployment, that assumption does not hold:

- the chat gateway lists 32 models and every one of them is a chat model; `POST /embeddings` answers
  **404** for `text-embedding-3-small` and there is no embedding id in the catalogue;
- the Render service carried `OPENCODE_API_KEY` and no `AI_EMBEDDING_MODEL`, so the client answered
  `null` and both memory recall and specialist routing ranked by words. Phase 2 shipped a vector
  path that had never run.

Two things were true at once, and the second is the reason this record exists rather than a comment:
a phase whose whole premise is "reachable by what the question means" cannot be delivered by the
provider it was written against, and a second credential is a decision, not an implementation detail.

## Decision

**Embeddings get their own endpoint and key, and the specialists' vectors are a generated file.**

1. **A second provider pair.** `AI_EMBEDDING_BASE_URL` and `AI_EMBEDDING_API_KEY` name the embedding
   provider; empty means the chat pair, which is still correct for an endpoint that serves both. The
   client keeps one OpenAI-compatible shape, so the provider is a URL, a model and a width.

2. **Cloudflare Workers AI, `@cf/baai/bge-m3`.** Multilingual (the questions are Arabic and the roster
   is not), 1024 dimensions, zero data retention on its model page, and $0.012 per million tokens
   against a free allowance of 10,000 Neurons a day — this feature spends about **322 Neurons at
   10,000 turns a day**, so the cost is a rounding error and the cap is a cap rather than a bill. The
   account already exists for R2, so this adds a read-only token and no vendor.

3. **The roster's vectors are a committed artifact, not a table.** The roster is vendored at a pinned
   upstream commit: identical in every deployment, public, no tenancy and no deletion path. A table
   would add a generation, a backfill, an RLS story and a round trip to store bytes that never vary by
   member. `npm run skills:index` writes `.opencode/skills/agency/agency-roster/vectors.json` (int8,
   base64, about 290 KB) with the model, the width and a hash of the roster it was built from;
   `npm run check:skills` fails when an edited description was not re-embedded, and the reader
   answers lexically rather than trusting a file that no longer describes the roster.

4. **A width belongs to its consumer.** The artifact declares 1024; `agent_memory_embeddings` is
   1536 and stays so. `createAiEmbeddingsClient({ dimensions })` lets the shortlist read a client of
   the artifact's width without pretending the memory table changed, and a vector whose width the
   memory generation cannot store is ignored by recall rather than written.

5. **Meaning and words are blended, not swapped.** The vectors rank by meaning; the roster's own
   words, through a small Arabic-to-English lexicon, rank exact terms — a member who writes «SEO» or
   «كود» means the specialist named by it. The lexical ranking is also the fallback when the provider
   answers nothing, so ADR-0185's "retrieval degrades, it does not fail" is one implementation and not
   two.

## Considered options

- **Google's Gemini free tier.** Rejected: its pricing page marks free-tier content as _"used to
  improve our products"_, and the paid tier is where that stops. Member messages are not the price of
  a free embedding.
- **A paid OpenAI key.** Rejected for now only: it would keep 1536 and cost about $0.006 a month at
  this volume, but it is a second billing relationship for a rounding error, and the client is
  provider-agnostic, so it stays available without a code change.
- **A local ONNX model.** Rejected: the origin is a 0.1 CPU / 512 MB free instance, and a 100 MB
  runtime to embed 30 tokens per turn spends the member's latency to save nothing.
- **A pgvector table for the roster.** Rejected for the reasons in decision 3; the Quran search index
  is the repository's own precedent for a committed generated index with a `--check` gate.
- **Embedding the division with each description.** Tried and reverted: every project-management
  specialist then answers to «مشروعي», and the fixtures measured the loss. The index is the name and
  the description.

## Consequences

- Two environment variables and one read-only token, on an account the deployment already has.
- Memory recall stays lexical until its own table generation is rebuilt at 1024 and backfilled
  (`npm run embeddings:backfill`); that is a separate change, and this record keeps it from looking
  like a regression.
- One artifact of about 290 KB in the repository, regenerated by one command when the roster moves.
- The routing number is a fixture measurement in the pull request, per ADR-0185 decision 2, and the
  fallback's number is measured beside it.
