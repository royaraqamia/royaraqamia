import { PRECIOUS_METAL_CODES } from '@/shared/contracts/rates';
import { fetchJson, type FetchJsonOptions } from '@/backend/clients/rates/fetch-json';

export interface FiatQuote {
  code: string;
  rate: number;
  date: string;
}

export interface FiatRatesResult {
  quotes: FiatQuote[];
}

export interface FiatRateProvider {
  fetchRates(base: string): Promise<FiatRatesResult>;
}

interface FrankfurterRow {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

const DEFAULT_BASE_URL = 'https://api.frankfurter.dev';

const PRECIOUS = new Set<string>(PRECIOUS_METAL_CODES);

export interface FrankfurterProviderOptions extends FetchJsonOptions {
  baseUrl?: string;
}

export function createFrankfurterProvider(
  options: FrankfurterProviderOptions = {}
): FiatRateProvider {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async fetchRates(base: string): Promise<FiatRatesResult> {
      const url = `${baseUrl}/v2/rates?base=${encodeURIComponent(base)}`;
      const rows = await fetchJson<FrankfurterRow[]>(url, options);

      const quotes = rows
        .filter((row) => Number.isFinite(row.rate) && row.rate > 0)
        .filter((row) => !PRECIOUS.has(row.quote))
        .map((row) => ({ code: row.quote, rate: row.rate, date: row.date }));

      return { quotes };
    },
  };
}
