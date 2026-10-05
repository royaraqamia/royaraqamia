import { describe, it, expect, vi } from 'vitest';
import {
  createYemenRateProvider,
  parseYemenMarketRate,
} from '@/backend/clients/rates/yemen-rate-provider';

const html = (buy: string) =>
  `<div>دولار أمريكي</div><div class="text-sm">US Dollar</div></div>` +
  `<div><div><span>شراء</span><span class="text-green-600">${buy}</span></div>` +
  `<div><span>بيع</span><span class="text-red-600">999.00</span></div></div>`;

describe('parseYemenMarketRate', () => {
  it('reads the USD buy value', () => {
    expect(parseYemenMarketRate(html('531.00'))).toBe(531);
    expect(parseYemenMarketRate(html('1,563.00'))).toBe(1563);
  });

  it('returns null without a US Dollar row', () => {
    expect(parseYemenMarketRate('<html></html>')).toBeNull();
  });
});

describe('createYemenRateProvider', () => {
  it('fetches both markets and keeps them separate', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      text: async () => html(url.endsWith('/sanaa') ? '531.00' : '1,563.00'),
    })) as unknown as typeof fetch;
    const provider = createYemenRateProvider({ fetchImpl, baseUrl: 'https://example.test' });

    await expect(provider.fetchVariants()).resolves.toEqual([
      { code: 'YER', parallel: 531, markets: { sanaa: 531, aden: 1563 }, date: '' },
    ]);
  });
});
