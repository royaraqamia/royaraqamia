import { logger } from '@/backend/shared/logger';

/**
 * A rate variant quote for one currency: an Official (central-bank) value, a
 * Parallel (market) value, or both. Values are units per base (USD) so they sit
 * alongside the reference `rates` map unchanged.
 */
export interface VariantQuote {
  code: string;
  official?: number;
  parallel?: number;
  /** Per-market parallel values when the parallel rate spans more than one
   * market (YER: Sanaa/Aden), keyed by market. */
  markets?: Record<string, number>;
  /** Quote date (`YYYY-MM-DD`), or '' when the source omits it. */
  date: string;
}

export interface RateVariantProvider {
  /** Stable source name, used for fallback reporting. */
  name: string;
  fetchVariants(): Promise<VariantQuote[]>;
}

export type VariantFallbackReporter = (source: string, error?: unknown) => void;

export interface CompositeVariantProviderOptions {
  onFallback?: VariantFallbackReporter;
}

/**
 * Merges several variant sources into one, never failing the whole sync for a
 * single source. A provider that throws is dropped and reported; a source that
 * returns both an official and a parallel value for the same code contributes
 * both (a later source fills fields an earlier one left empty).
 */
export function createCompositeVariantProvider(
  providers: RateVariantProvider[],
  options: CompositeVariantProviderOptions = {}
): RateVariantProvider {
  const { onFallback } = options;

  return {
    name: providers.map((provider) => provider.name).join('+') || 'variants',
    async fetchVariants(): Promise<VariantQuote[]> {
      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            return await provider.fetchVariants();
          } catch (error) {
            logger.warn('A rate variant source failed; keeping the reference value', {
              source: provider.name,
              error: String(error),
            });
            onFallback?.(provider.name, error);
            return [] as VariantQuote[];
          }
        })
      );

      const byCode = new Map<string, VariantQuote>();
      for (const quote of results.flat()) {
        const existing = byCode.get(quote.code);
        byCode.set(quote.code, {
          code: quote.code,
          official: quote.official ?? existing?.official,
          parallel: quote.parallel ?? existing?.parallel,
          markets: quote.markets ? { ...existing?.markets, ...quote.markets } : existing?.markets,
          date: quote.date || existing?.date || '',
        });
      }
      return [...byCode.values()];
    },
  };
}
