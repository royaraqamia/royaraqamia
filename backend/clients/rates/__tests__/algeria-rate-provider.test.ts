import { describe, it, expect, vi } from 'vitest';
import {
  createAlgeriaRateProvider,
  parseAlgeriaOfficialRate,
  parseAlgeriaParallelRate,
} from '@/backend/clients/rates/algeria-rate-provider';

const officialPayload = {
  updatedAt: '2026-10-05T11:00:39.449Z',
  currencies: [{ code: 'USD', buy: 133.37, sell: 133.37 }],
};
const parallelPayload = {
  updatedAt: '2026-10-05T11:00:39.449Z',
  currencies: [{ code: 'USD', buy: 238, sell: 242 }],
};

describe('algeria parsers', () => {
  it('reads the official and parallel USD prices', () => {
    expect(parseAlgeriaOfficialRate(officialPayload)).toBe(133.37);
    expect(parseAlgeriaParallelRate(parallelPayload)).toBe(238);
  });

  it('returns null without a USD row', () => {
    expect(parseAlgeriaOfficialRate({ currencies: [] })).toBeNull();
  });
});

describe('createAlgeriaRateProvider', () => {
  it('fetches both endpoints and combines them', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith('/official') ? officialPayload : parallelPayload),
    })) as unknown as typeof fetch;
    const provider = createAlgeriaRateProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchVariants()).resolves.toEqual([
      { code: 'DZD', official: 133.37, parallel: 238, date: '2026-10-05' },
    ]);
  });
});
