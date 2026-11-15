import { afterEach, describe, expect, it, vi } from 'vitest';

import { main, parseArgs, summarizeReport } from '../backfill-agent-embeddings/run';
import type { BackfillReport } from '@/backend/shared/domain/agent-memory';
import type { MemoryEmbeddingsService } from '@/backend/services/agent/memory-embeddings-service';

function service(report: BackfillReport): MemoryEmbeddingsService {
  return {
    backfill: vi.fn(async () => report),
  } as unknown as MemoryEmbeddingsService;
}

describe('the backfill command’s arguments', () => {
  it('defaults to fifty batches of thirty-two, the deployment’s own ceiling', () => {
    expect(parseArgs([])).toEqual({ batches: 50, batch: 32 });
  });

  it('takes the ceilings an operator passes', () => {
    expect(parseArgs(['--batches', '200', '--batch', '64'])).toEqual({ batches: 200, batch: 64 });
  });

  it('refuses a number that is not a positive whole one, rather than guessing', () => {
    expect(() => parseArgs(['--batches', '0'])).toThrow('positive whole number');
    expect(() => parseArgs(['--batch', 'half'])).toThrow('positive whole number');
    expect(() => parseArgs(['--dry-run'])).toThrow('unknown option');
  });
});

describe('the backfill command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says what it did in one line, and exits zero when the queue is empty', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const report = { embedded: 2, batches: 1, stopped: 'done', pending: 0 } as const;

    expect(await main([], service(report))).toBe(0);
    expect(write).toHaveBeenCalledWith(
      'memory embeddings: done, 2 embedded, 1 batch(es), 0 still pending\n'
    );
  });

  it('exits zero when it stopped at the ceiling: that is a resume, not a failure', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const report = { embedded: 4, batches: 2, stopped: 'batch-limit', pending: 9 } as const;

    expect(await main(['--batches', '2'], service(report))).toBe(0);
  });

  it('exits non-zero when the provider left work behind, so a workflow notices', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const report = { embedded: 0, batches: 0, stopped: 'provider', pending: 12 } as const;

    expect(await main([], service(report))).toBe(1);
  });

  it('exits zero when there is no provider but nothing to embed either', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const report = { embedded: 0, batches: 0, stopped: 'provider', pending: 0 } as const;

    expect(await main([], service(report))).toBe(0);
  });

  it('describes a run without pretending a stopped one finished', () => {
    expect(summarizeReport({ embedded: 0, batches: 0, stopped: 'provider', pending: 12 })).toBe(
      'memory embeddings: provider, 0 embedded, 0 batch(es), 12 still pending'
    );
  });
});
