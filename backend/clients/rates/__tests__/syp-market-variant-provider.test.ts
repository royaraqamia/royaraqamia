import { describe, it, expect, vi } from 'vitest';
import { createSypMarketVariantProvider } from '@/backend/clients/rates/syp-market-variant-provider';
import type { SypMarketProvider } from '@/backend/clients/rates/syp-market-provider';

function marketProvider(quote: unknown): SypMarketProvider {
  return { fetchQuote: vi.fn().mockResolvedValue(quote) } as unknown as SypMarketProvider;
}

describe('createSypMarketVariantProvider', () => {
  it('maps the market quote to a parallel SYP variant', async () => {
    const provider = createSypMarketVariantProvider(
      marketProvider({ rate: 138, date: '2026-10-05' })
    );

    await expect(provider.fetchVariants()).resolves.toEqual([
      { code: 'SYP', parallel: 138, date: '2026-10-05' },
    ]);
  });

  it('throws when the market quote is unavailable so the source is reported', async () => {
    const provider = createSypMarketVariantProvider(marketProvider(null));

    await expect(provider.fetchVariants()).rejects.toThrow('unavailable');
  });
});
