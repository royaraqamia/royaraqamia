import { fetchText, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import type {
  RateVariantProvider,
  VariantQuote,
} from '@/backend/clients/rates/variant-rate-provider';

/**
 * A second, keyless source for the Iraqi Dinar market rate.
 *
 * iraqprices.com (the primary) sits behind Cloudflare and challenges serverless
 * egresses, so it can silently stop answering. IQWealth serves the same Baghdad
 * street rate from Vercel with no bot challenge, which keeps the IQD parallel
 * value alive when the primary is blocked.
 */
const DEFAULT_BASE_URL = 'https://iraqsm.com';

const FX_PATH = '/fx';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'ar',
} as const;

/** The page states both prices in one phrase: "… 1,598 ديناراً في السوق الموازية و1,310 ديناراً رسمياً". */
const PARALLEL_PATTERN = /([0-9][0-9,]*)\s*ديناراً في السوق الموازية/;
const OFFICIAL_PATTERN = /و\s*([0-9][0-9,]*)\s*ديناراً رسمياً/;

export interface IraqSmRateProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

function toNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseIraqSmRates(html: string): VariantQuote | null {
  const parallel = toNumber(PARALLEL_PATTERN.exec(html)?.[1]);
  const official = toNumber(OFFICIAL_PATTERN.exec(html)?.[1]);
  if (parallel === undefined && official === undefined) return null;
  return { code: 'IQD', official, parallel, date: '' };
}

export function createIraqSmRateProvider(
  options: IraqSmRateProviderOptions = {}
): RateVariantProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const headers = { ...DEFAULT_HEADERS, ...options.headers };

  return {
    name: 'iraqsm',
    async fetchVariants(): Promise<VariantQuote[]> {
      const html = await fetchText(baseUrl + FX_PATH, { ...options, headers });
      const quote = parseIraqSmRates(html);
      return quote ? [quote] : [];
    },
  };
}
