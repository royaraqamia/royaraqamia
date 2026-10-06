import { z } from 'zod';

export const RATE_BASE_CURRENCY = 'USD';

export const TROY_OUNCE_GRAMS = 31.1034768;

export const GOLD_KARATS = [24, 22, 21, 18] as const;
export type GoldKarat = (typeof GOLD_KARATS)[number];

export const METALS = [
  { code: 'XAU', name: 'الذَّهب', nameEn: 'Gold' },
  { code: 'XAG', name: 'الفِضَّة', nameEn: 'Silver' },
] as const;

export type MetalCode = (typeof METALS)[number]['code'];

export const GOLD_CODE: MetalCode = 'XAU';
export const METAL_CODES: readonly MetalCode[] = METALS.map((metal) => metal.code);

export const PRECIOUS_METAL_CODES = ['XAU', 'XAG', 'XPT', 'XPD'] as const;

export const DISPLAY_CURRENCY_CODES: readonly string[] = [
  'USD',
  'EUR',
  'SAR',
  'AED',
  'EGP',
  'JOD',
  'IQD',
  'SYP',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'YER',
  'LBP',
  'LYD',
  'TND',
  'DZD',
  'MAD',
  'MRU',
];

export const DISPLAY_CURRENCY_SET = new Set<string>(DISPLAY_CURRENCY_CODES);

/**
 * Currencies whose Parallel Rate splits across more than one market, and the
 * markets (in display order). YER has two: Sanaa (old notes) and Aden (new
 * notes), roughly a 3x gap — they are shown separately and never blended.
 */
export const PARALLEL_MARKETS: Record<string, readonly { key: string; name: string }[]> = {
  YER: [
    { key: 'sanaa', name: 'صنعاء' },
    { key: 'aden', name: 'عدن' },
  ],
};

export const RATE_RANGES = ['1W', '1M', '1Y'] as const;
export type RateRange = (typeof RATE_RANGES)[number];

/**
 * Which price a dual-rate Currency is quoted on. `official` is the central-bank
 * rate (or the reference feed when no central-bank source exists); `parallel`
 * is the informal market rate. Metals ignore the basis.
 */
export const RATE_BASES = ['official', 'parallel'] as const;
export type RateBasis = (typeof RATE_BASES)[number];

export interface CurrencyRate {
  rate: number;
  previousRate: number | null;
  changePct: number | null;
  /** Quote date of this value (`YYYY-MM-DD`), or null when the source omits it. */
  asOf: string | null;
}

export interface ParallelMarket {
  key: string;
  name: string;
  rate: CurrencyRate;
}

export interface CurrencyQuote {
  code: string;
  name: string;
  symbol: string;
  /** Official rate: the central-bank value when a dedicated source answered,
   * otherwise the reference feed. Always present. */
  rate: number;
  previousRate: number | null;
  changePct: number | null;
  /** Quote date of the official value (`YYYY-MM-DD`), or null. */
  asOf: string | null;
  /** Parallel-market rate; present only for a dual-rate Currency. */
  parallel: CurrencyRate | null;
  /** Per-market parallel rates when the parallel value spans more than one
   * market (YER). Absent for single-market currencies. */
  parallelMarkets?: ParallelMarket[];
}

export interface MetalKaratQuote {
  karat: number;
  pricePerGramUsd: number;
}

export interface MetalQuote {
  code: string;
  name: string;
  pricePerOunceUsd: number;
  pricePerGramUsd: number;
  previousPricePerOunceUsd: number | null;
  changePct: number | null;
  karats: MetalKaratQuote[];
}

export interface RatesBoard {
  base: string;
  fetchedAt: string;
  providerQuoteDate: string;
  isStale: boolean;
  currencies: CurrencyQuote[];
  metals: MetalQuote[];
}

export interface RateSeriesPoint {
  date: string;
  value: number;
}

export interface RateSeries {
  code: string;
  kind: 'currency' | 'metal';
  points: RateSeriesPoint[];
}

export interface RateHealth {
  ok: boolean;
  lastSuccessAt: string | null;
  providerQuoteDate: string | null;
  stale: boolean;
  /** Dual-rate codes whose market value the board is holding from an earlier sync. */
  staleParallels: string[];
}

export const RateSeriesQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase()),
  range: z.enum(RATE_RANGES).default('1M'),
  basis: z.enum(RATE_BASES).default('official'),
});

export type RateSeriesQuery = z.infer<typeof RateSeriesQuerySchema>;
