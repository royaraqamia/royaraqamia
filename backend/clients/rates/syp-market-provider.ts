import { fetchText, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';
import { OLD_SYP_PER_NEW_SYP } from '@/shared/currency';

/**
 * A market (parallel/"street") rate for the Syrian Pound.
 *
 * The ECB reference rate Frankfurter serves for SYP diverges sharply from the
 * rate Syrians actually trade at, so the two are not interchangeable. This
 * provider reads the market rate and expresses it in the *new* (redenominated)
 * pound, which is the unit the rest of the board uses.
 */
export interface SypMarketQuote {
  /** Value of 1 USD in new SYP. */
  rate: number;
  /** Calendar date of the quote (`YYYY-MM-DD`). */
  date: string;
}

export interface SypMarketProvider {
  fetchQuote(): Promise<SypMarketQuote | null>;
}

const DEFAULT_BASE_URL = 'https://sp-today.com';

/** The "سوريا - عام" (Syria — General) city bucket. */
const DEFAULT_CITY = 'damascus';

/** sp-today serves a browser challenge to bare clients from datacenter IPs. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': BROWSER_USER_AGENT,
  'Accept-Language': 'ar',
} as const;

/** Each server-rendered React chunk arrives as `self.__next_f.push([1,"…"])`. */
const FLIGHT_PUSH_PATTERN = /self\.__next_f\.push\(\[1,\s*("[\s\S]*?")\]\)/g;

/** The rates array inside the flight payload's root data object. */
const RATES_MARKER = '"rates":[';

export interface SpTodayProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
  city?: string;
}

function concatFlightPayload(html: string): string {
  let flight = '';
  let match: RegExpExecArray | null;
  FLIGHT_PUSH_PATTERN.lastIndex = 0;
  while ((match = FLIGHT_PUSH_PATTERN.exec(html)) !== null) {
    const chunk = match[1];
    if (!chunk) continue;
    try {
      flight += JSON.parse(chunk) as string;
    } catch {
      // A malformed chunk is skipped; later chunks may still carry the rates.
    }
  }
  return flight;
}

/** Returns the balanced JSON array that starts at `marker`'s trailing `[`. */
function sliceArrayAfter(flight: string, marker: string): string | null {
  const start = flight.indexOf(marker);
  if (start === -1) return null;

  const open = start + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < flight.length; i++) {
    const char = flight[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') {
      depth--;
      if (depth === 0) return flight.slice(open, i + 1);
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts the USD/SYP market rate from an sp-today.com page.
 *
 * The page is a Next.js server render, so the rates live in the RSC flight
 * payload rather than a JSON API. We read the `rates` array, take the USD row,
 * and use the requested city's **buy** (شراء) price — the value quoted first on
 * the page — converted from old to new pounds.
 */
export function parseSypMarketQuote(
  html: string,
  city: string = DEFAULT_CITY
): SypMarketQuote | null {
  const raw = sliceArrayAfter(concatFlightPayload(html), RATES_MARKER);
  if (raw === null) return null;

  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;

  const usd = rows.find((row) => isRecord(row) && row.code === 'USD');
  if (!isRecord(usd) || !isRecord(usd.cities)) return null;

  const cityRate = usd.cities[city];
  if (!isRecord(cityRate)) return null;

  const buy = cityRate.buy;
  if (typeof buy !== 'number' || !Number.isFinite(buy) || buy <= 0) return null;

  const rate = buy / OLD_SYP_PER_NEW_SYP;
  const date = typeof usd.updated_at === 'string' ? usd.updated_at.slice(0, 10) : '';

  return { rate, date };
}

export function createSpTodayProvider(options: SpTodayProviderOptions = {}): SypMarketProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const city = options.city ?? DEFAULT_CITY;
  const headers = { ...DEFAULT_HEADERS, ...options.headers };

  return {
    async fetchQuote(): Promise<SypMarketQuote | null> {
      const html = await fetchText(baseUrl, { ...options, headers });
      return parseSypMarketQuote(html, city);
    },
  };
}
