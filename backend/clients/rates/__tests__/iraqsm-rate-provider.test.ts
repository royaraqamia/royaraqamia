import { describe, it, expect, vi } from 'vitest';
import {
  createIraqSmRateProvider,
  parseIraqSmRates,
} from '@/backend/clients/rates/iraqsm-rate-provider';

const fxHtml =
  '<html><head><meta name="description" content="سعر الدولار اليوم في العراق 1,598 ديناراً في السوق الموازية و1,310 ديناراً رسمياً. سعر 100 دولار" /></head></html>';

describe('parseIraqSmRates', () => {
  it('reads the parallel and official prices from the page', () => {
    expect(parseIraqSmRates(fxHtml)).toEqual({
      code: 'IQD',
      official: 1310,
      parallel: 1598,
      date: '',
    });
  });

  it('returns null when neither price is present', () => {
    expect(parseIraqSmRates('<html><body>404</body></html>')).toBeNull();
  });
});

describe('createIraqSmRateProvider', () => {
  it('fetches the fx page and parses the quote', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => fxHtml,
    })) as unknown as typeof fetch;
    const provider = createIraqSmRateProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchVariants()).resolves.toEqual([
      { code: 'IQD', official: 1310, parallel: 1598, date: '' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/fx',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') }),
      })
    );
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const provider = createIraqSmRateProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchVariants()).rejects.toThrow('503');
  });
});
