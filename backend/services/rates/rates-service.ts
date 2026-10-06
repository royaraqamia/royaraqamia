import type { FiatRateProvider } from '@/backend/clients/rates/fiat-rate-provider';
import type { MetalPriceProvider } from '@/backend/clients/rates/metal-price-provider';
import type { RateVariantProvider } from '@/backend/clients/rates/variant-rate-provider';
import type {
  RatesRepository,
  ParallelSnapshot,
  RateSnapshot,
  RateVariant,
} from '@/backend/repositories/rates/rates-repository';
import { logger } from '@/backend/shared/logger';
import {
  DISPLAY_CURRENCY_SET,
  GOLD_KARATS,
  METALS,
  PARALLEL_MARKETS,
  RATE_BASE_CURRENCY,
  type MetalQuote,
  type ParallelMarket,
  type RateBasis,
  type RateHealth,
  type RateRange,
  type RateSeries,
  type RateSeriesPoint,
  type RatesBoard,
} from '@/shared/contracts/rates';
import { getCurrencyDisplayName, getCurrencyDisplaySymbol } from '@/shared/currency';
import { computeChangePct, karatPricePerGram, pricePerGram } from '@/shared/rates';

type RatesLogger = Pick<typeof logger, 'error' | 'warn' | 'info'>;

export interface RatesServiceOptions {
  now?: () => Date;
  staleAfterMs?: number;
  staleQuoteAfterMs?: number;
  /** How far back the board looks for a currency's last known parallel value. */
  parallelLastKnownMs?: number;
  logger?: RatesLogger;
}

export interface RefreshResult {
  snapshotId: string;
  providerQuoteDate: string;
  currencyCount: number;
  metalCount: number;
}

const DEFAULT_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const DEFAULT_STALE_QUOTE_AFTER_MS = 96 * 60 * 60 * 1000;

/**
 * A parallel feed is an unversioned third-party source that can fail on any
 * sync, so rather than blank the market value the board falls back to the last
 * value it ever received, as long as it is within this window (ADR-0014). The
 * value keeps its original quote date so the page can age it honestly.
 */
const DEFAULT_PARALLEL_LAST_KNOWN_MS = 30 * 24 * 60 * 60 * 1000;

const RANGE_DAYS: Record<RateRange, number> = {
  '1W': 7,
  '1M': 30,
  '1Y': 365,
};

/** Resolves a currency's value on a basis, falling back to the reference feed. */
function variantRate(snapshot: RateSnapshot, code: string, basis: RateBasis): number | undefined {
  if (basis === 'parallel') {
    return snapshot.parallel_rates[code]?.rate ?? snapshot.rates[code];
  }
  return snapshot.official_rates[code]?.rate ?? snapshot.rates[code];
}

/** Builds the per-market parallel rates for a currency that has more than one. */
function buildParallelMarkets(
  code: string,
  current: RateVariant | undefined,
  previous: RateVariant | undefined,
  fallbackDate: string
): ParallelMarket[] | undefined {
  const defs = PARALLEL_MARKETS[code];
  const markets = current?.markets;
  if (!defs || !markets) return undefined;

  const built = defs.flatMap((def): ParallelMarket[] => {
    const value = markets[def.key];
    if (!value) return [];
    const previousRate = previous?.markets?.[def.key]?.rate ?? null;
    return [
      {
        key: def.key,
        name: def.name,
        rate: {
          rate: value.rate,
          previousRate,
          changePct: computeChangePct(value.rate, previousRate),
          asOf: value.date ?? fallbackDate,
        },
      },
    ];
  });

  return built.length > 0 ? built : undefined;
}

export class RatesService {
  private readonly now: () => Date;
  private readonly staleAfterMs: number;
  private readonly staleQuoteAfterMs: number;
  private readonly parallelLastKnownMs: number;
  private readonly log: RatesLogger;

  constructor(
    private readonly repository: RatesRepository,
    private readonly fiatProvider: FiatRateProvider,
    private readonly metalProvider: MetalPriceProvider,
    private readonly variantProvider: RateVariantProvider,
    options: RatesServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.staleQuoteAfterMs = options.staleQuoteAfterMs ?? DEFAULT_STALE_QUOTE_AFTER_MS;
    this.parallelLastKnownMs = options.parallelLastKnownMs ?? DEFAULT_PARALLEL_LAST_KNOWN_MS;
    this.log = options.logger ?? logger;
  }

  async refresh(): Promise<RefreshResult> {
    const runId = await this.repository.startSyncRun('frankfurter+gold-api+variants');
    try {
      const [fiat, metals, variants] = await Promise.all([
        this.fiatProvider.fetchRates(RATE_BASE_CURRENCY),
        this.metalProvider.fetchPrices(),
        this.variantProvider.fetchVariants(),
      ]);

      const rates: Record<string, number> = {};
      let latestQuoteDate = '';
      for (const quote of fiat.quotes) {
        rates[quote.code] = quote.rate;
        if (quote.date > latestQuoteDate) latestQuoteDate = quote.date;
      }

      const metalPrices: Record<string, number> = {};
      for (const price of metals.prices) {
        metalPrices[price.code] = price.pricePerOunceUsd;
      }

      const officialRates: Record<string, RateVariant> = {};
      const parallelRates: Record<string, RateVariant> = {};
      for (const quote of variants) {
        const date = quote.date || null;
        if (quote.official !== undefined) {
          officialRates[quote.code] = { rate: quote.official, date };
        }
        if (quote.parallel !== undefined) {
          const markets = quote.markets
            ? Object.fromEntries(
                Object.entries(quote.markets).map(([key, rate]) => [key, { rate, date }])
              )
            : undefined;
          parallelRates[quote.code] = {
            rate: quote.parallel,
            date,
            ...(markets ? { markets } : {}),
          };
        }
      }

      if (Object.keys(rates).length === 0) {
        throw new Error('fiat provider returned no rates');
      }

      const quoteDate = latestQuoteDate || this.now().toISOString().slice(0, 10);
      const snapshot = await this.repository.insertSnapshot({
        base_currency: RATE_BASE_CURRENCY,
        provider_quote_date: quoteDate,
        rates,
        metals: metalPrices,
        official_rates: officialRates,
        parallel_rates: parallelRates,
      });

      const currencyCount = Object.keys(rates).length;
      const metalCount = Object.keys(metalPrices).length;

      await this.repository.finishSyncRun(runId, {
        status: 'success',
        snapshot_id: snapshot.id,
        provider_quote_date: snapshot.provider_quote_date,
        currency_count: currencyCount,
        metal_count: metalCount,
      });

      return {
        snapshotId: snapshot.id,
        providerQuoteDate: snapshot.provider_quote_date,
        currencyCount,
        metalCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.repository.finishSyncRun(runId, { status: 'failure', error: message });
      } catch (finishError) {
        this.log.error('Failed to record rate sync failure', { error: String(finishError) });
      }
      this.log.error('Rate sync failed', { error: message });
      throw error;
    }
  }

  async getBoard(): Promise<RatesBoard | null> {
    const latest = await this.repository.getLatestSnapshot();
    if (!latest) return null;
    const since = new Date(this.now().getTime() - this.parallelLastKnownMs).toISOString();
    const [previous, parallels] = await Promise.all([
      this.repository.getSnapshotBefore(latest.fetched_at),
      this.repository.getParallelsSince(since),
    ]);
    return this.buildBoard(latest, previous, this.lastKnownParallels(parallels));
  }

  async getSeries(
    code: string,
    range: RateRange,
    basis: RateBasis = 'official'
  ): Promise<RateSeries | null> {
    const upper = code.toUpperCase();
    const isMetal = METALS.some((metal) => metal.code === upper);

    const latest = await this.repository.getLatestSnapshot();
    if (!latest) return null;

    const known = isMetal
      ? latest.metals[upper] !== undefined
      : upper === latest.base_currency ||
        latest.rates[upper] !== undefined ||
        latest.official_rates[upper] !== undefined ||
        latest.parallel_rates[upper] !== undefined;
    if (!known) return null;

    const since = new Date(
      this.now().getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000
    ).toISOString();
    const snapshots = await this.repository.getSnapshotsSince(since);

    const byDate = new Map<string, number>();
    for (const snapshot of snapshots) {
      const value = isMetal
        ? snapshot.metals[upper]
        : upper === snapshot.base_currency
          ? 1
          : variantRate(snapshot, upper, basis);
      if (value !== undefined) byDate.set(snapshot.fetched_at.slice(0, 10), value);
    }

    const points: RateSeriesPoint[] = Array.from(byDate.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { code: upper, kind: isMetal ? 'metal' : 'currency', points };
  }

  async getHealth(): Promise<RateHealth> {
    const since = new Date(this.now().getTime() - this.parallelLastKnownMs).toISOString();
    const [lastRun, latest, parallels] = await Promise.all([
      this.repository.getLastSuccessfulRun(),
      this.repository.getLatestSnapshot(),
      this.repository.getParallelsSince(since),
    ]);

    const fetchedAt = latest?.fetched_at ?? lastRun?.finished_at ?? null;
    const stale =
      fetchedAt === null ||
      this.now().getTime() - new Date(fetchedAt).getTime() > this.staleAfterMs;

    const lastKnown = this.lastKnownParallels(parallels);
    const codes = new Set([...Object.keys(latest?.parallel_rates ?? {}), ...lastKnown.keys()]);
    const staleParallels = latest
      ? [...codes].filter((code) => {
          const effective = this.effectiveParallel(latest, lastKnown, code);
          return effective !== undefined && effective.date < latest.provider_quote_date;
        })
      : [];

    return {
      ok: lastRun !== null && !stale,
      lastSuccessAt: lastRun?.finished_at ?? null,
      providerQuoteDate: latest?.provider_quote_date ?? null,
      stale,
      staleParallels,
    };
  }

  /**
   * The parallel variant to show for a currency, with the date to display for
   * it. Normally this snapshot's own value; when a sync omitted it — the market
   * source failed — the last known value from a recent snapshot, keeping its
   * original quote date (ADR-0014).
   */
  private effectiveParallel(
    latest: RateSnapshot,
    lastKnown: Map<string, { variant: RateVariant; date: string }>,
    code: string
  ): { variant: RateVariant; date: string } | undefined {
    const current = latest.parallel_rates[code];
    if (current) {
      return { variant: current, date: current.date ?? latest.fetched_at.slice(0, 10) };
    }
    return lastKnown.get(code);
  }

  /** The newest parallel value per code across recent snapshots, with its date. */
  private lastKnownParallels(
    snapshots: ParallelSnapshot[]
  ): Map<string, { variant: RateVariant; date: string }> {
    const byCode = new Map<string, { variant: RateVariant; date: string }>();
    const ordered = [...snapshots].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
    for (const snapshot of ordered) {
      for (const [code, variant] of Object.entries(snapshot.parallel_rates)) {
        if (byCode.has(code)) continue;
        byCode.set(code, { variant, date: variant.date ?? snapshot.fetched_at.slice(0, 10) });
      }
    }
    return byCode;
  }

  private buildBoard(
    latest: RateSnapshot,
    previous: RateSnapshot | null,
    lastKnown: Map<string, { variant: RateVariant; date: string }>
  ): RatesBoard {
    const rateEntries = new Map<string, number>([
      [latest.base_currency, 1],
      ...Object.entries(latest.rates),
    ]);

    const currencies = [...rateEntries.entries()]
      .filter(([code]) => DISPLAY_CURRENCY_SET.has(code))
      .map(([code, referenceRate]) => {
        const officialVariant = latest.official_rates[code];
        const officialRate = officialVariant?.rate ?? referenceRate;
        const previousReference =
          previous?.rates[code] ?? (code === latest.base_currency ? 1 : null);
        const previousOfficial = previous?.official_rates[code]?.rate ?? previousReference;

        const effectiveParallel = this.effectiveParallel(latest, lastKnown, code);
        const parallelPrevious = previous?.parallel_rates[code]?.rate ?? null;

        return {
          code,
          name: getCurrencyDisplayName(code),
          symbol: getCurrencyDisplaySymbol(code),
          rate: officialRate,
          previousRate: previousOfficial,
          changePct: computeChangePct(officialRate, previousOfficial),
          asOf: officialVariant?.date ?? latest.provider_quote_date,
          parallel: effectiveParallel
            ? {
                rate: effectiveParallel.variant.rate,
                previousRate: parallelPrevious,
                changePct: computeChangePct(effectiveParallel.variant.rate, parallelPrevious),
                asOf: effectiveParallel.date,
              }
            : null,
          parallelMarkets: buildParallelMarkets(
            code,
            effectiveParallel?.variant,
            previous?.parallel_rates[code],
            effectiveParallel?.date ?? latest.fetched_at.slice(0, 10)
          ),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const metals: MetalQuote[] = METALS.flatMap((metal) => {
      const perOunce = latest.metals[metal.code];
      if (perOunce === undefined) return [];
      const previousPerOunce = previous?.metals[metal.code] ?? null;
      return [
        {
          code: metal.code,
          name: metal.name,
          pricePerOunceUsd: perOunce,
          pricePerGramUsd: pricePerGram(perOunce),
          previousPricePerOunceUsd: previousPerOunce,
          changePct: computeChangePct(perOunce, previousPerOunce),
          karats:
            metal.code === 'XAU'
              ? GOLD_KARATS.map((karat) => ({
                  karat,
                  pricePerGramUsd: karatPricePerGram(perOunce, karat),
                }))
              : [],
        },
      ];
    });

    const isStale =
      this.now().getTime() - new Date(latest.provider_quote_date).getTime() >
      this.staleQuoteAfterMs;

    return {
      base: latest.base_currency,
      fetchedAt: latest.fetched_at,
      providerQuoteDate: latest.provider_quote_date,
      isStale,
      currencies,
      metals,
    };
  }
}
