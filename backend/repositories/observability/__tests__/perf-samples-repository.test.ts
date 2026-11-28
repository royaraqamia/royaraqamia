import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/backend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createPerfSamplesRepository,
  type PerfSample,
} from '@/backend/repositories/observability/perf-samples-repository';
import type { Database } from '@/backend/models/database.types';

/**
 * The column names are the whole risk here: one wrong key is a silent 400 from
 * PostgREST or a row the table's shape check refuses (#1885, ADR-0228).
 */

const SAMPLE: PerfSample = {
  kind: 'launch',
  platform: 'shell',
  cold: true,
  shellMs: 400,
  contentMs: 820,
  paintMs: null,
  lcpMs: null,
  cls: null,
  inpMs: null,
  ttfbMs: null,
};

function client(insert: ReturnType<typeof vi.fn>) {
  return { from: () => ({ insert }) } as unknown as Parameters<
    typeof createPerfSamplesRepository
  >[0];
}

describe('createPerfSamplesRepository', () => {
  it('inserts one row in the column names the table uses', async () => {
    const insert = vi.fn(() => ({
      abortSignal: () => Promise.resolve({ error: null }),
    }));

    await createPerfSamplesRepository(client(insert)).record(SAMPLE);

    expect(insert).toHaveBeenCalledWith({
      kind: 'launch',
      platform: 'shell',
      cold: true,
      shell_ms: 400,
      content_ms: 820,
      paint_ms: null,
      lcp_ms: null,
      cls: null,
      inp_ms: null,
      ttfb_ms: null,
    });
  });

  it('crosses the seam as a repository failure when the insert is refused', async () => {
    const insert = vi.fn(() => ({
      abortSignal: () => Promise.resolve({ error: { message: 'permission denied' } }),
    }));

    await expect(createPerfSamplesRepository(client(insert)).record(SAMPLE)).rejects.toMatchObject({
      name: 'RepositoryError',
      operation: 'perfSamples.record',
    });
  });

  it('bounds the write so a stuck database cannot hold the beacon open', async () => {
    let signal: AbortSignal | undefined;
    const insert = vi.fn(() => ({
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return Promise.resolve({ error: null });
      },
    }));

    await createPerfSamplesRepository(client(insert)).record(SAMPLE);

    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

// `Database` is imported so this file participates in the generated-table type
// check: a rename in `database.types.ts` fails here before it fails at runtime.
export type PerfSamplesTableIsTyped = Database['public']['Tables']['perf_samples']['Row'];
