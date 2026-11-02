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

/**
 * The board's shapes are schemas, not types (#658).
 *
 * The app reads the same board the page renders, so the JSON the route answers is
 * generated into Kotlin by `contracts:generate`; a field the board stops carrying
 * is then a compile error in the app rather than a column that draws nothing.
 * The TypeScript names are inferred from the schemas, so every existing use keeps
 * the shape it had.
 */
export const CurrencyRateSchema = z.object({
  rate: z.number(),
  previousRate: z.number().nullable(),
  changePct: z.number().nullable(),
  /** Quote date of this value (`YYYY-MM-DD`), or null when the source omits it. */
  asOf: z.string().nullable(),
});

export type CurrencyRate = z.infer<typeof CurrencyRateSchema>;

export const ParallelMarketSchema = z.object({
  key: z.string(),
  name: z.string(),
  rate: CurrencyRateSchema,
});

export type ParallelMarket = z.infer<typeof ParallelMarketSchema>;

export const CurrencyQuoteSchema = z.object({
  code: z.string(),
  name: z.string(),
  symbol: z.string(),
  /** The central-bank value when a dedicated source answered, else the reference feed. */
  rate: z.number(),
  previousRate: z.number().nullable(),
  changePct: z.number().nullable(),
  asOf: z.string().nullable(),
  /** Present only for a dual-rate Currency. */
  parallel: CurrencyRateSchema.nullable(),
  /** Per-market parallel rates when the value spans more than one market (YER). */
  parallelMarkets: z.array(ParallelMarketSchema).optional(),
});

export type CurrencyQuote = z.infer<typeof CurrencyQuoteSchema>;

export const MetalKaratQuoteSchema = z.object({
  karat: z.number(),
  pricePerGramUsd: z.number(),
});

export type MetalKaratQuote = z.infer<typeof MetalKaratQuoteSchema>;

export const MetalQuoteSchema = z.object({
  code: z.string(),
  name: z.string(),
  pricePerOunceUsd: z.number(),
  pricePerGramUsd: z.number(),
  previousPricePerOunceUsd: z.number().nullable(),
  changePct: z.number().nullable(),
  karats: z.array(MetalKaratQuoteSchema),
});

export type MetalQuote = z.infer<typeof MetalQuoteSchema>;

export const RatesBoardSchema = z.object({
  base: z.string(),
  fetchedAt: z.string(),
  providerQuoteDate: z.string(),
  isStale: z.boolean(),
  currencies: z.array(CurrencyQuoteSchema),
  metals: z.array(MetalQuoteSchema),
});

export type RatesBoard = z.infer<typeof RatesBoardSchema>;

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
  /** The last Rate Sync Run's `finished_at` — that the feed is running at all. */
  lastSuccessAt: string | null;
  providerQuoteDate: string | null;
  /**
   * Whether `providerQuoteDate` is older than the board's staleness threshold.
   * The same quantity the page ages, so a feed that keeps fetching
   * successfully with an unchanged quote date cannot report healthy while the
   * page shows the stale-rates badge (ADR-0011). A missing quote date is stale.
   */
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
