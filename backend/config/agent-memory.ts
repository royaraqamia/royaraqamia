import type { SupabaseClient } from '@supabase/supabase-js';

import { createAiEmbeddingsClient, type AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import { getAdminSupabase } from '@/backend/config/supabase';
import type { Database } from '@/backend/models/database.types';
import { createSupabaseAgentMemoriesRepository } from '@/backend/repositories/agent/agent-memories-repository';
import { createSupabaseMemoryEmbeddingsRepository } from '@/backend/repositories/agent/memory-embeddings-repository';
import {
  createAgentMemoryService,
  type AgentMemoryService,
} from '@/backend/services/agent/agent-memory-service';
import {
  createMemoryEmbeddingsService,
  type MemoryEmbeddingsService,
} from '@/backend/services/agent/memory-embeddings-service';
import {
  createAgentRecallService,
  type AgentRecallService,
} from '@/backend/services/agent/agent-recall-service';

/**
 * Wire the memory embedding service for one client (ADR-0185, #1425).
 *
 * The `SupabaseClient` is a parameter rather than a `getAdminSupabase()` call so
 * the backfill command — which runs outside a request, where `next/headers` has
 * no cookie jar — can hand in its own service-role client and still run the same
 * service, the same repository and the same client as a turn would.
 *
 * `client` is a parameter for the other half of the same reason: the backfill can
 * pass `null` and report the queue instead of pretending to embed it.
 */
export function createMemoryEmbeddingsFor(
  supabase: SupabaseClient<Database>,
  client: AiEmbeddingsClient | null = createAiEmbeddingsClient()
): MemoryEmbeddingsService {
  return createMemoryEmbeddingsService({
    repository: createSupabaseMemoryEmbeddingsRepository(supabase),
    client,
  });
}

/**
 * Wire the fact store for one caller (ADR-0182 decisions 2 and 7, #1509).
 *
 * Two clients, on purpose. The facts are read and written through the caller's
 * own session, so RLS is what says whose row it is; the vector is written on the
 * service role, because `agent_memory_embeddings` deliberately grants a member
 * select and nothing else. Handing in one client for both would either widen the
 * table's policies or move the fact read onto the service role, and decision 7
 * forbids the second.
 */
export function createAgentMemoryFor(
  supabase: SupabaseClient<Database>,
  options: { embeddings?: MemoryEmbeddingsService } = {}
): AgentMemoryService {
  return createAgentMemoryService({
    repository: createSupabaseAgentMemoriesRepository(supabase),
    embeddings: options.embeddings ?? createMemoryEmbeddingsFor(getAdminSupabase()),
  });
}

/**
 * Wire the turn's recall (ADR-0182 decision 3, #1510).
 *
 * The query vector is embedded by the deployment's embedding client, and the
 * search runs on the caller's own session: `agent_memory_nearest` is `security
 * invoker`, so the member's policies are the boundary and recall cannot read a
 * row the member cannot read. `client` is a parameter for the same reason the
 * embedding service takes one — a deployment with no key, or a test, passes
 * `null` and gets no recall block rather than a failed turn.
 */
export function createAgentRecallFor(
  supabase: SupabaseClient<Database>,
  options: { embeddings?: MemoryEmbeddingsService; client?: AiEmbeddingsClient | null } = {}
): AgentRecallService {
  // One provider instance for both halves: the query vector and the fact
  // vectors come from the same model, and the "one warning per reason" the
  // client keeps is then one warning, not two.
  const client = options.client === undefined ? createAiEmbeddingsClient() : options.client;
  const embeddings = options.embeddings ?? createMemoryEmbeddingsFor(supabase, client);
  return createAgentRecallService({
    nearest: (userId, embedding, scope, limit) =>
      embeddings.nearest(userId, embedding, scope, limit),
    client,
  });
}
