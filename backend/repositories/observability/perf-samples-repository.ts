import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods, repositoryFailure } from '@/backend/shared/repository-error';
import type { AppPerfPlatform } from '@/shared/contracts/app-perf';

/**
 * The perf beacon's one table (#1885, ADR-0228).
 *
 * The row is the record the contract already validates - the kind, the
 * platform, the cold/warm flag and that kind's durations - and nothing else. A
 * column the kind does not own is written as `null` rather than left out, so the
 * insert has one shape and the table's check constraint is the second gate
 * behind the route's schema.
 *
 * The write is bounded: the client does not await this beacon (ADR-0074), so a
 * database that stops answering must not hold the request open until the
 * platform's own timeout. `abortSignal` is that bound; the caller treats the
 * rejection as a dropped sample, not an error page.
 */

export interface PerfSample {
  kind: 'launch' | 'tap' | 'vitals';
  platform: AppPerfPlatform;
  cold: boolean | null;
  shellMs: number | null;
  contentMs: number | null;
  paintMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
}

export interface PerfSamplesRepository {
  /** One row per beacon. Throws a `RepositoryError` when the insert fails. */
  record(sample: PerfSample): Promise<void>;
}

/** How long an insert may hold the request before it is abandoned. */
export const PERF_SAMPLE_WRITE_TIMEOUT_MS = 2_000;

export function createPerfSamplesRepository(
  supabase: SupabaseClient<Database>
): PerfSamplesRepository {
  return guardRepositoryMethods<PerfSamplesRepository>({
    async record(sample) {
      const { error } = await supabase
        .from('perf_samples')
        .insert({
          kind: sample.kind,
          platform: sample.platform,
          cold: sample.cold,
          shell_ms: sample.shellMs,
          content_ms: sample.contentMs,
          paint_ms: sample.paintMs,
          lcp_ms: sample.lcpMs,
          cls: sample.cls,
          inp_ms: sample.inpMs,
          ttfb_ms: sample.ttfbMs,
        })
        .abortSignal(AbortSignal.timeout(PERF_SAMPLE_WRITE_TIMEOUT_MS));

      if (error) throw repositoryFailure('perfSamples.record', error);
    },
  });
}
