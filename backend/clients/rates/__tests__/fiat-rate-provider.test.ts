import { describe, it, expect, vi } from 'vitest';
import { createFrankfurterProvider } from '@/backend/clients/rates/fiat-rate-provider';

const rows = [
  { date: '2026-10-04', base: 'USD', quote: 'SAR', rate: 3.75 },
  { date: '2026-10-04', base: 'USD', quote: 'JPY', rate: 150 },
  { date: '2026-10-03', base: 'USD', quote: 'XAU', rate: 0.0005 },
  { date: '2026-10-04', base: 'USD', quote: 'BAD', rate: 0 },
];

function mockFetch(body: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
}

describe('createFrankfurterProvider', () => {
  it('maps rows and filters precious metals and non-positive rates', async () => {
    const fetchImpl = mockFetch(rows);
    const provider = createFrankfurterProvider({ fetchImpl, baseUrl: 'https://example.test' });

    const result = await provider.fetchRates('USD');

    expect(result.quotes).toEqual([
      { code: 'SAR', rate: 3.75, date: '2026-10-04' },
      { code: 'JPY', rate: 150, date: '2026-10-04' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v2/rates?base=USD',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    const provider = createFrankfurterProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchRates('USD')).rejects.toThrow('500');
  });
});
