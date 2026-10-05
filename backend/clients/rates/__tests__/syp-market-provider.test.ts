import { describe, it, expect, vi } from 'vitest';
import {
  createSpTodayProvider,
  parseSypMarketQuote,
} from '@/backend/clients/rates/syp-market-provider';

const rates = [
  {
    code: 'USD',
    slug: 'us-dollar',
    cities: {
      damascus: { buy: 13800, sell: 13875 },
      alhasakah: { buy: 13825, sell: 13875 },
    },
    updated_at: '2026-10-05T11:56:02+03:00',
  },
  {
    code: 'EUR',
    slug: 'euro',
    cities: { damascus: { buy: 15350, sell: 15560 } },
    updated_at: '2026-10-05T11:56:02+03:00',
  },
];

function flightHtml(payloadRates: unknown): string {
  const payload = `5:["$","$L1a",null,{"lang":"ar","data":{"cities":[],"rates":${JSON.stringify(payloadRates)}}}]`;
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`;
}

describe('parseSypMarketQuote', () => {
  it('reads the Damascus USD buy price and converts old SYP to new', () => {
    expect(parseSypMarketQuote(flightHtml(rates))).toEqual({ rate: 138, date: '2026-10-05' });
  });

  it('honours a different city bucket', () => {
    expect(parseSypMarketQuote(flightHtml(rates), 'alhasakah')?.rate).toBeCloseTo(138.25);
  });

  it('returns null when the flight payload carries no rates', () => {
    expect(parseSypMarketQuote('<html><body>no data</body></html>')).toBeNull();
  });

  it('returns null when USD is absent', () => {
    expect(parseSypMarketQuote(flightHtml([{ code: 'EUR', cities: {} }]))).toBeNull();
  });
});

describe('createSpTodayProvider', () => {
  it('fetches and parses the page', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => flightHtml(rates),
    })) as unknown as typeof fetch;
    const provider = createSpTodayProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchQuote()).resolves.toEqual({ rate: 138, date: '2026-10-05' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const provider = createSpTodayProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchQuote()).rejects.toThrow('503');
  });
});
