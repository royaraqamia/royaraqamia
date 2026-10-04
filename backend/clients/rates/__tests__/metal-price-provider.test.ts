import { describe, it, expect, vi } from 'vitest';
import { createGoldApiProvider } from '@/backend/clients/rates/metal-price-provider';

function mockFetch() {
  return vi.fn(async (url: string) => {
    const isGold = url.endsWith('/XAU');
    return {
      ok: true,
      json: async () => ({
        symbol: isGold ? 'XAU' : 'XAG',
        price: isGold ? 2000 : 25,
        updatedAt: '2026-10-04T06:00:00Z',
      }),
    };
  }) as unknown as typeof fetch;
}

describe('createGoldApiProvider', () => {
  it('fetches each metal price', async () => {
    const fetchImpl = mockFetch();
    const provider = createGoldApiProvider({ fetchImpl, baseUrl: 'https://example.test' });

    const result = await provider.fetchPrices();

    expect(result.prices).toEqual([
      { code: 'XAU', pricePerOunceUsd: 2000, updatedAt: '2026-10-04T06:00:00Z' },
      { code: 'XAG', pricePerOunceUsd: 25, updatedAt: '2026-10-04T06:00:00Z' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/price/XAU',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('drops non-positive prices', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        symbol: url.endsWith('/XAU') ? 'XAU' : 'XAG',
        price: url.endsWith('/XAU') ? 0 : 25,
        updatedAt: '2026-10-04T06:00:00Z',
      }),
    })) as unknown as typeof fetch;
    const provider = createGoldApiProvider({ fetchImpl, baseUrl: 'https://example.test' });

    const result = await provider.fetchPrices();

    expect(result.prices).toEqual([
      { code: 'XAG', pricePerOunceUsd: 25, updatedAt: '2026-10-04T06:00:00Z' },
    ]);
  });
});
