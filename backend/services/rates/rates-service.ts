import type { FiatRateProvider } from '@/backend/clients/rates/fiat-rate-provider';
import type { MetalPriceProvider } from '@/backend/clients/rates/metal-price-provider';
import type { RatesRepository, RateSnapshot } from '@/backend/repositories/rates/rates-repository';
import { logger } from '@/backend/shared/logger';
import {
  DISPLAY_CURRENCY_SET,
  GOLD_KARATS,
  METALS,
  RATE_BASE_CURRENCY,
  type MetalQuote,
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

const RANGE_DAYS: Record<RateRange, number> = {
  '1W': 7,
  '1M': 30,
  '1Y': 365,
};

export class RatesService {
  private readonly now: () => Date;
  private readonly staleAfterMs: number;
  private readonly staleQuoteAfterMs: number;
  private readonly log: RatesLogger;

  constructor(
    private readonly repository: RatesRepository,
    private readonly fiatProvider: FiatRateProvider,
    private readonly metalProvider: MetalPriceProvider,
    options: RatesServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.staleQuoteAfterMs = options.staleQuoteAfterMs ?? DEFAULT_STALE_QUOTE_AFTER_MS;
    this.log = options.logger ?? logger;
  }

  async refresh(): Promise<RefreshResult> {
    const runId = await this.repository.startSyncRun('frankfurter+gold-api');
    try {
      const [fiat, metals] = await Promise.all([
        this.fiatProvider.fetchRates(RATE_BASE_CURRENCY),
        this.metalProvider.fetchPrices(),
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

      if (Object.keys(rates).length === 0) {
        throw new Error('fiat provider returned no rates');
      }

      const quoteDate = latestQuoteDate || this.now().toISOString().slice(0, 10);
      const snapshot = await this.repository.insertSnapshot({
        base_currency: RATE_BASE_CURRENCY,
        provider_quote_date: quoteDate,
        rates,
        metals: metalPrices,
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
    const previous = await this.repository.getSnapshotBefore(latest.fetched_at);
    return this.buildBoard(latest, previous);
  }

  async getSeries(code: string, range: RateRange): Promise<RateSeries | null> {
    const upper = code.toUpperCase();
    const isMetal = METALS.some((metal) => metal.code === upper);

    const latest = await this.repository.getLatestSnapshot();
    if (!latest) return null;

    const known = isMetal
      ? latest.metals[upper] !== undefined
      : upper === latest.base_currency || latest.rates[upper] !== undefined;
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
          : snapshot.rates[upper];
      if (value !== undefined) byDate.set(snapshot.fetched_at.slice(0, 10), value);
    }

    const points: RateSeriesPoint[] = Array.from(byDate.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { code: upper, kind: isMetal ? 'metal' : 'currency', points };
  }

  async getHealth(): Promise<RateHealth> {
    const [lastRun, latest] = await Promise.all([
      this.repository.getLastSuccessfulRun(),
      this.repository.getLatestSnapshot(),
    ]);

    const fetchedAt = latest?.fetched_at ?? lastRun?.finished_at ?? null;
    const stale =
      fetchedAt === null ||
      this.now().getTime() - new Date(fetchedAt).getTime() > this.staleAfterMs;

    return {
      ok: lastRun !== null && !stale,
      lastSuccessAt: lastRun?.finished_at ?? null,
      providerQuoteDate: latest?.provider_quote_date ?? null,
      stale,
    };
  }

  private buildBoard(latest: RateSnapshot, previous: RateSnapshot | null): RatesBoard {
    const rateEntries = new Map<string, number>([
      [latest.base_currency, 1],
      ...Object.entries(latest.rates),
    ]);

    const currencies = [...rateEntries.entries()]
      .filter(([code]) => DISPLAY_CURRENCY_SET.has(code))
      .map(([code, rate]) => {
        const previousRate = previous?.rates[code] ?? (code === latest.base_currency ? 1 : null);
        return {
          code,
          name: getCurrencyDisplayName(code),
          symbol: getCurrencyDisplaySymbol(code),
          rate,
          previousRate,
          changePct: computeChangePct(rate, previousRate),
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
