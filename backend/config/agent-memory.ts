import type { SupabaseClient } from '@supabase/supabase-js';

import { createAiEmbeddingsClient, type AiEmbeddingsClient } from '@/backend/clients/ai-embeddings';
import type { Database } from '@/backend/models/database.types';
import { createSupabaseMemoryEmbeddingsRepository } from '@/backend/repositories/agent/memory-embeddings-repository';
import {
  createMemoryEmbeddingsService,
  type MemoryEmbeddingsService,
} from '@/backend/services/agent/memory-embeddings-service';

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
