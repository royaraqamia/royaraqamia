import type { SypMarketProvider } from '@/backend/clients/rates/syp-market-provider';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * Adapts a Syrian Pound market scraper to the variant seam. Under ADR-0013 the
 * market value is stored as the SYP parallel rate rather than overwriting the
 * reference. A missing quote is treated as a source failure so scraper drift is
 * reported instead of silently producing no parallel value. `name` labels the
 * source in fallback reports; register several behind the composite to fail over.
 */
export function createSypMarketVariantProvider(
  provider: SypMarketProvider,
  name = 'sp-today'
): RateVariantProvider {
  return {
    name,
    async fetchVariants(): Promise<VariantQuote[]> {
      const quote = await provider.fetchQuote();
      if (!quote || !Number.isFinite(quote.rate) || quote.rate <= 0) {
        throw new Error(`${name} SYP market quote unavailable`);
      }
      return [{ code: 'SYP', parallel: quote.rate, date: quote.date }];
    },
  };
}
