import { describe, it, expect, vi } from 'vitest';
import type { FiatRateProvider } from '@/backend/clients/rates/fiat-rate-provider';
import type { SypMarketProvider } from '@/backend/clients/rates/syp-market-provider';
import {
  createSypAwareFiatProvider,
  type SypFallbackReporter,
} from '@/backend/clients/rates/syp-aware-fiat-provider';

const baseQuotes = {
  quotes: [
    { code: 'SAR', rate: 3.75, date: '2026-10-05' },
    { code: 'SYP', rate: 122.15, date: '2026-10-05' },
  ],
};

function makeProviders(marketQuote: unknown, onFallback?: SypFallbackReporter) {
  const baseProvider = {
    fetchRates: vi.fn().mockResolvedValue(baseQuotes),
  } as unknown as FiatRateProvider;
  const sypProvider = {
    fetchQuote: vi.fn().mockResolvedValue(marketQuote),
  } as unknown as SypMarketProvider;
  return {
    provider: createSypAwareFiatProvider(baseProvider, sypProvider, { onFallback }),
    sypProvider,
  };
}

describe('createSypAwareFiatProvider', () => {
  it('replaces the reference SYP quote with the market value and does not report', async () => {
    const onFallback = vi.fn();
    const { provider } = makeProviders({ rate: 138, date: '2026-10-05' }, onFallback);

    const result = await provider.fetchRates('USD');

    expect(result.quotes).toEqual([
      { code: 'SAR', rate: 3.75, date: '2026-10-05' },
      { code: 'SYP', rate: 138, date: '2026-10-05' },
    ]);
    expect(result.quotes.filter((quote) => quote.code === 'SYP')).toHaveLength(1);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('falls back to the reference quote and reports no_quote when the market quote is null', async () => {
    const onFallback = vi.fn();
    const { provider } = makeProviders(null, onFallback);

    const result = await provider.fetchRates('USD');

    expect(result.quotes).toEqual(baseQuotes.quotes);
    expect(onFallback).toHaveBeenCalledWith('no_quote');
  });

  it('keeps the reference quote and reports fetch_failed when the market provider throws', async () => {
    const onFallback = vi.fn();
    const baseProvider = {
      fetchRates: vi.fn().mockResolvedValue(baseQuotes),
    } as unknown as FiatRateProvider;
    const sypProvider = {
      fetchQuote: vi.fn().mockRejectedValue(new Error('down')),
    } as unknown as SypMarketProvider;
    const provider = createSypAwareFiatProvider(baseProvider, sypProvider, { onFallback });

    const result = await provider.fetchRates('USD');

    expect(result.quotes).toEqual(baseQuotes.quotes);
    expect(onFallback).toHaveBeenCalledWith('fetch_failed', expect.any(Error));
  });
});
