import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { repositoryFailure } from '@/backend/shared/repository-error';

/**
 * The one write extraction makes before it spends a provider call (ADR-0182
 * decision 2, #1511): claim the settled turn.
 *
 * `agent_turns.extracted_at` is the claim, not an outcome. It is written before
 * the call, so a provider that hangs, a schema that fails and a second
 * invocation that races the first all end the same way — one attempt per turn.
 * The update is the lock: Postgres decides between two callers, and the loser
 * reads zero rows and returns without paying for a second call.
 *
 * The row is the authority for the member too: extraction takes the turn id and
 * nothing else, so a background task cannot name somebody else's account.
 */
export interface MemoryExtractionRepository {
  /** True only for the caller that took the turn's single attempt. */
  claim(turnId: string, at: string): Promise<boolean>;
}

export function createSupabaseMemoryExtractionRepository(
  supabase: SupabaseClient<Database>
): MemoryExtractionRepository {
  return {
    async claim(turnId, at) {
      const { data, error } = await supabase
        .from('agent_turns')
        .update({ extracted_at: at })
        .eq('id', turnId)
        .is('extracted_at', null)
        // Only a turn that finished is worth reading: a claimed or failed one
        // has no answer to extract from.
        .not('settled_at', 'is', null)
        .select('id');

      if (error) throw repositoryFailure('agent.memoryExtraction.claim', error);
      return (data?.length ?? 0) > 0;
    },
  };
}
