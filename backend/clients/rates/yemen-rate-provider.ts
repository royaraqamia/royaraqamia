import { fetchText, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * Yemen has two parallel markets: Sanaa (old notes, ~531) and Aden (new notes,
 * ~1563), roughly a 3x gap. Naqdi Live (naqdilive.com) publishes both as
 * server-rendered HTML, so each city page is fetched and the USD **buy** (شراء)
 * value read from its row. The two stay separate and are never averaged.
 */
const DEFAULT_BASE_URL = 'https://naqdilive.com';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Display order; the first is the default parallel value. */
const MARKETS = ['sanaa', 'aden'] as const;

export interface YemenRateProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

/** Reads the USD buy price from a Naqdi Live city page. */
export function parseYemenMarketRate(html: string): number | null {
  const row = html.indexOf('US Dollar');
  if (row < 0) return null;
  const buy = html.indexOf('شراء', row);
  if (buy < 0) return null;
  const match = />\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*</.exec(html.slice(buy));
  if (!match) return null;
  const value = Number((match[1] ?? '').replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function createYemenRateProvider(
  options: YemenRateProviderOptions = {}
): RateVariantProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const headers = { 'User-Agent': BROWSER_USER_AGENT, ...options.headers };

  return {
    name: 'naqdilive',
    async fetchVariants(): Promise<VariantQuote[]> {
      const pages = await Promise.all(
        MARKETS.map((market) =>
          fetchText(`${baseUrl}/currencies/${market}`, { ...options, headers })
        )
      );

      const markets: Record<string, number> = {};
      MARKETS.forEach((market, index) => {
        const rate = parseYemenMarketRate(pages[index] ?? '');
        if (rate !== null) markets[market] = rate;
      });

      const preferred = markets.sanaa ?? markets.aden;
      if (preferred === undefined) return [];
      return [{ code: 'YER', parallel: preferred, markets, date: '' }];
    },
  };
}
