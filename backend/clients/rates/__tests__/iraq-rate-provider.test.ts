import { describe, it, expect, vi } from 'vitest';
import { createIraqRateProvider, parseIraqRates } from '@/backend/clients/rates/iraq-rate-provider';

describe('parseIraqRates', () => {
  it('reads the official and parallel values with the payload date', () => {
    expect(
      parseIraqRates({
        updated: '2026-10-05T11:15:49.846Z',
        dollar: { official: 1310, parallel: 1596.5 },
      })
    ).toEqual({ code: 'IQD', official: 1310, parallel: 1596.5, date: '2026-10-05' });
  });

  it('returns null without a usable dollar row', () => {
    expect(parseIraqRates({})).toBeNull();
    expect(parseIraqRates({ dollar: { official: 0, parallel: 0 } })).toBeNull();
  });
});

describe('createIraqRateProvider', () => {
  it('fetches and parses the payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        updated: '2026-10-05T00:00:00.000Z',
        dollar: { official: 1310, parallel: 1590 },
      }),
    })) as unknown as typeof fetch;
    const provider = createIraqRateProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchVariants()).resolves.toEqual([
      { code: 'IQD', official: 1310, parallel: 1590, date: '2026-10-05' },
    ]);
  });
});
