import { fetchText, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import type {
  SypMarketProvider,
  SypMarketQuote,
} from '@/backend/clients/rates/syp-market-provider';

/**
 * A second, keyless source for the Syrian Pound market rate.
 *
 * sp-today (ADR-0012) sits behind Cloudflare and challenges serverless egresses,
 * so it can silently stop answering. Lira Scope serves the same Damascus street
 * rate from plain nginx with no bot challenge, which keeps the parallel value
 * alive when sp-today is blocked. It already quotes the *new* (redenominated)
 * pound, so unlike the sp-today feed there is no 100:1 step.
 */
const DEFAULT_BASE_URL = 'https://lirascope.syria-cloud.sy';

const DEFAULT_PATH = '/ar/currency/usd';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'ar',
} as const;

/** The headline price in the page's meta description. */
const META_RATE_PATTERN = /مقابل الليرة السورية اليوم:\s*([0-9]+(?:\.[0-9]+)?)/;

/** Fallback: the large market figure rendered in the page body. */
const BODY_RATE_PATTERN = /scope-big nums[^>]*>\s*([0-9]+(?:\.[0-9]+)?)\s*</;

export interface LirascopeProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

/** Reads the USD/black-market price from a Lira Scope currency page. */
export function parseLirascopeQuote(html: string): SypMarketQuote | null {
  const match = META_RATE_PATTERN.exec(html) ?? BODY_RATE_PATTERN.exec(html);
  if (!match) return null;

  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return { rate, date: '' };
}

export function createLirascopeProvider(options: LirascopeProviderOptions = {}): SypMarketProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const headers = { ...DEFAULT_HEADERS, ...options.headers };

  return {
    async fetchQuote(): Promise<SypMarketQuote | null> {
      const html = await fetchText(baseUrl + DEFAULT_PATH, { ...options, headers });
      return parseLirascopeQuote(html);
    },
  };
}
