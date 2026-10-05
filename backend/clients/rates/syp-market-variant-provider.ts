import type { SypMarketProvider } from '@/backend/clients/rates/syp-market-provider';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * Adapts the existing sp-today market scraper to the variant seam. Under
 * ADR-0013 the market value is stored as the SYP parallel rate rather than
 * overwriting the reference. A missing quote is treated as a source failure so
 * scraper drift is reported instead of silently producing no parallel value.
 */
export function createSypMarketVariantProvider(provider: SypMarketProvider): RateVariantProvider {
  return {
    name: 'sp-today',
    async fetchVariants(): Promise<VariantQuote[]> {
      const quote = await provider.fetchQuote();
      if (!quote || !Number.isFinite(quote.rate) || quote.rate <= 0) {
        throw new Error('SYP market quote unavailable');
      }
      return [{ code: 'SYP', parallel: quote.rate, date: quote.date }];
    },
  };
}
