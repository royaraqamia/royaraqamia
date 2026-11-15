import { createClient } from '@supabase/supabase-js';

import { createMemoryEmbeddingsFor } from '@/backend/config/agent-memory';
import { env } from '@/backend/config/env';
import type { Database } from '@/backend/models/database.types';
import type { BackfillReport } from '@/backend/shared/domain/agent-memory';
import type { MemoryEmbeddingsService } from '@/backend/services/agent/memory-embeddings-service';

/**
 * Backfill the memory vectors (ADR-0185 decision 6, #1425).
 *
 *   node scripts/backfill-agent-embeddings.mjs [--batches <n>] [--batch <n>]
 *
 * The same service a write path uses, driven in a loop instead of once per fact.
 * It is **idempotent**: every written row leaves the pending view, so a re-run
 * continues where the last one stopped and a completed run embeds nothing. That
 * is also what makes a dimension change an ordinary job — point the deployment
 * at the new generation, run this until it reports `done`, and the old table can
 * be dropped when it holds no readers (decision 6).
 *
 * It talks to the project on the service role, which is the only role that may
 * write a vector: a member cannot forge one, and the pending view is not granted
 * to one either.
 */

interface Options {
  batches: number;
  batch: number;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = { batches: 50, batch: 32 };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const read = (): number => {
      const value = Number(argv[index + 1]);
      index += 1;
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${flag} needs a positive whole number`);
      }
      return value;
    };

    if (flag === '--batches') options.batches = read();
    else if (flag === '--batch') options.batch = read();
    else throw new Error(`unknown option: ${flag}`);
  }

  return options;
}

/** One line, because this is what a person reads in a workflow log. */
export function summarizeReport(report: BackfillReport): string {
  return [
    `memory embeddings: ${report.stopped}`,
    `${report.embedded} embedded`,
    `${report.batches} batch(es)`,
    `${report.pending} still pending`,
  ].join(', ');
}

function serviceClient(): MemoryEmbeddingsService {
  const url = env.supabaseUrl;
  const serviceRoleKey = env.supabaseServiceRoleKey;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createMemoryEmbeddingsFor(supabase);
}

export async function main(
  argv: string[],
  service: MemoryEmbeddingsService = serviceClient()
): Promise<number> {
  const options = parseArgs(argv);
  const report = await service.backfill({ maxBatches: options.batches, batchSize: options.batch });

  process.stdout.write(`${summarizeReport(report)}\n`);

  // A provider that refused is a deployment problem the operator has to fix, and
  // a run that leaves work behind must not read as success in a workflow. No
  // provider configured at all is the same state as a provider that failed here:
  // the queue is real and nobody embedded it. A queue with nothing in it is not
  // a failure, whatever the reason.
  return report.stopped === 'provider' && report.pending > 0 ? 1 : 0;
}
