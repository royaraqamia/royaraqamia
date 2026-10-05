import type { FiatRateProvider, FiatRatesResult } from '@/backend/clients/rates/fiat-rate-provider';
import type {
  SypMarketProvider,
  SypMarketQuote,
} from '@/backend/clients/rates/syp-market-provider';
import { logger } from '@/backend/shared/logger';

/** Why the SYP market read fell back to the reference rate. */
export type SypFallbackReason =
  /** The feed could not be reached or returned a non-OK response. */
  | 'fetch_failed'
  /** The feed responded but no usable quote could be parsed — likely scraper drift. */
  | 'no_quote';

export type SypFallbackReporter = (reason: SypFallbackReason, error?: unknown) => void;

export interface SypAwareFiatProviderOptions {
  /** Notified when the market value is unavailable and the reference rate is used. */
  onFallback?: SypFallbackReporter;
}

/**
 * Overlays the Syrian Pound market rate onto a reference provider's quotes.
 *
 * The base provider (Frankfurter/ECB) still supplies every other currency; SYP
 * is replaced by the parallel-market value when it is available. If the market
 * feed is down or unparseable we keep the reference rate rather than fail the
 * whole sync — a stale-but-labelled reference is better than no board at all.
 * Every fallback is reported so a silent regression (feed outage or a changed
 * page shape) becomes a visible alert instead of a wrong number on the page.
 */
export function createSypAwareFiatProvider(
  baseProvider: FiatRateProvider,
  sypProvider: SypMarketProvider,
  options: SypAwareFiatProviderOptions = {}
): FiatRateProvider {
  const { onFallback } = options;

  return {
    async fetchRates(base: string): Promise<FiatRatesResult> {
      const result = await baseProvider.fetchRates(base);

      let quote: SypMarketQuote | null;
      try {
        quote = await sypProvider.fetchQuote();
      } catch (error) {
        logger.warn('SYP market rate fetch failed; keeping the reference rate', {
          error: String(error),
        });
        onFallback?.('fetch_failed', error);
        return result;
      }

      if (!quote || !Number.isFinite(quote.rate) || quote.rate <= 0) {
        logger.warn('SYP market quote missing; keeping the reference rate');
        onFallback?.('no_quote');
        return result;
      }

      const fallbackDate = result.quotes.reduce((latest, item) => {
        return item.date > latest ? item.date : latest;
      }, '');
      const date = quote.date || fallbackDate;

      return {
        quotes: [
          ...result.quotes.filter((item) => item.code !== 'SYP'),
          { code: 'SYP', rate: quote.rate, date },
        ],
      };
    },
  };
}
