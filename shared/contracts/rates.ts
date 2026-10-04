import { z } from 'zod';

export const RATE_BASE_CURRENCY = 'USD';

export const TROY_OUNCE_GRAMS = 31.1034768;

export const GOLD_KARATS = [24, 22, 21, 18] as const;
export type GoldKarat = (typeof GOLD_KARATS)[number];

export const METALS = [
  { code: 'XAU', name: 'الذَّهَب', nameEn: 'Gold' },
  { code: 'XAG', name: 'الفِضَّة', nameEn: 'Silver' },
] as const;

export type MetalCode = (typeof METALS)[number]['code'];
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
  'SDG',
  'MRU',
  'SOS',
  'DJF',
  'KMF',
];

export const DISPLAY_CURRENCY_SET = new Set<string>(DISPLAY_CURRENCY_CODES);

export const RATE_RANGES = ['1W', '1M', '1Y'] as const;
export type RateRange = (typeof RATE_RANGES)[number];

export interface CurrencyQuote {
  code: string;
  name: string;
  symbol: string;
  rate: number;
  previousRate: number | null;
  changePct: number | null;
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
}

export const RateSeriesQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase()),
  range: z.enum(RATE_RANGES).default('1M'),
});

export type RateSeriesQuery = z.infer<typeof RateSeriesQuerySchema>;
