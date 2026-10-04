import { describe, it, expect, vi } from 'vitest';
import type { FiatRateProvider } from '@/backend/clients/rates/fiat-rate-provider';
import type { MetalPriceProvider } from '@/backend/clients/rates/metal-price-provider';
import type {
  RatesRepository,
  RateSnapshot,
  RateSyncRun,
} from '@/backend/repositories/rates/rates-repository';
import { RatesService } from '@/backend/services/rates/rates-service';

const NOW = new Date('2026-10-04T12:00:00.000Z');
const silentLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

function snapshot(overrides: Partial<RateSnapshot> = {}): RateSnapshot {
  return {
    id: 'snap-1',
    base_currency: 'USD',
    provider_quote_date: '2026-10-04',
    fetched_at: '2026-10-04T06:00:00.000Z',
    rates: { SAR: 3.75, JPY: 150 },
    metals: { XAU: 2000 },
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RatesRepository> = {}): RatesRepository {
  return {
    getLatestSnapshot: vi.fn(),
    getSnapshotBefore: vi.fn(),
    getSnapshotsSince: vi.fn(),
    insertSnapshot: vi.fn(),
    startSyncRun: vi.fn(),
    finishSyncRun: vi.fn(),
    getLastSuccessfulRun: vi.fn(),
    ...overrides,
  } as unknown as RatesRepository;
}

function makeService(repository: RatesRepository) {
  const fiatProvider = { fetchRates: vi.fn() } as unknown as FiatRateProvider;
  const metalProvider = { fetchPrices: vi.fn() } as unknown as MetalPriceProvider;
  const service = new RatesService(repository, fiatProvider, metalProvider, {
    now: () => NOW,
    logger: silentLogger,
  });
  return { service, fiatProvider, metalProvider };
}

describe('RatesService.refresh', () => {
  it('stores a snapshot and records a successful run', async () => {
    const repository = makeRepo({
      startSyncRun: vi.fn().mockResolvedValue('run-1'),
      insertSnapshot: vi.fn().mockResolvedValue(snapshot()),
      finishSyncRun: vi.fn().mockResolvedValue(undefined),
    });
    const { service, fiatProvider, metalProvider } = makeService(repository);
    (fiatProvider.fetchRates as ReturnType<typeof vi.fn>).mockResolvedValue({
      quotes: [
        { code: 'SAR', rate: 3.75, date: '2026-10-04' },
        { code: 'JPY', rate: 150, date: '2026-10-03' },
      ],
    });
    (metalProvider.fetchPrices as ReturnType<typeof vi.fn>).mockResolvedValue({
      prices: [{ code: 'XAU', pricePerOunceUsd: 2000, updatedAt: '2026-10-04T06:00:00Z' }],
    });

    const result = await service.refresh();

    expect(repository.insertSnapshot).toHaveBeenCalledWith({
      base_currency: 'USD',
      provider_quote_date: '2026-10-04',
      rates: { SAR: 3.75, JPY: 150 },
      metals: { XAU: 2000 },
    });
    expect(repository.finishSyncRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'success',
        snapshot_id: 'snap-1',
        currency_count: 2,
        metal_count: 1,
      })
    );
    expect(result.snapshotId).toBe('snap-1');
  });

  it('records a failed run and stores nothing when a provider throws', async () => {
    const repository = makeRepo({
      startSyncRun: vi.fn().mockResolvedValue('run-2'),
      insertSnapshot: vi.fn(),
      finishSyncRun: vi.fn().mockResolvedValue(undefined),
    });
    const { service, fiatProvider, metalProvider } = makeService(repository);
    (fiatProvider.fetchRates as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    (metalProvider.fetchPrices as ReturnType<typeof vi.fn>).mockResolvedValue({ prices: [] });

    await expect(service.refresh()).rejects.toThrow('boom');

    expect(repository.insertSnapshot).not.toHaveBeenCalled();
    expect(repository.finishSyncRun).toHaveBeenCalledWith(
      'run-2',
      expect.objectContaining({ status: 'failure', error: 'boom' })
    );
  });

  it('fails when the fiat feed is empty', async () => {
    const repository = makeRepo({
      startSyncRun: vi.fn().mockResolvedValue('run-3'),
      insertSnapshot: vi.fn(),
      finishSyncRun: vi.fn().mockResolvedValue(undefined),
    });
    const { service, fiatProvider, metalProvider } = makeService(repository);
    (fiatProvider.fetchRates as ReturnType<typeof vi.fn>).mockResolvedValue({ quotes: [] });
    (metalProvider.fetchPrices as ReturnType<typeof vi.fn>).mockResolvedValue({ prices: [] });

    await expect(service.refresh()).rejects.toThrow('no rates');
    expect(repository.insertSnapshot).not.toHaveBeenCalled();
  });
});

describe('RatesService.getBoard', () => {
  it('returns null without a snapshot', async () => {
    const { service } = makeService(
      makeRepo({ getLatestSnapshot: vi.fn().mockResolvedValue(null) })
    );
    await expect(service.getBoard()).resolves.toBeNull();
  });

  it('computes deltas and metal derivations', async () => {
    const repository = makeRepo({
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot()),
      getSnapshotBefore: vi.fn().mockResolvedValue(
        snapshot({
          id: 'snap-0',
          fetched_at: '2026-10-03T06:00:00.000Z',
          rates: { SAR: 3.6, JPY: 140 },
          metals: { XAU: 1900 },
        })
      ),
    });
    const { service } = makeService(repository);

    const board = await service.getBoard();
    expect(board).not.toBeNull();
    const sar = board!.currencies.find((currency) => currency.code === 'SAR')!;
    expect(sar.previousRate).toBe(3.6);
    expect(sar.changePct).toBeCloseTo(((3.75 - 3.6) / 3.6) * 100);

    const gold = board!.metals.find((metal) => metal.code === 'XAU')!;
    expect(gold.previousPricePerOunceUsd).toBe(1900);
    expect(gold.pricePerGramUsd).toBeCloseTo(2000 / 31.1034768);
    expect(gold.karats).toHaveLength(4);
    expect(board!.isStale).toBe(false);
  });

  it('flags staleness from the provider quote date', async () => {
    const repository = makeRepo({
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot({ provider_quote_date: '2026-09-01' })),
      getSnapshotBefore: vi.fn().mockResolvedValue(null),
    });
    const { service } = makeService(repository);

    const board = await service.getBoard();
    expect(board!.isStale).toBe(true);
  });
});

describe('RatesService.getSeries', () => {
  it('returns a dated series for a known currency', async () => {
    const repository = makeRepo({
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot({ rates: { SAR: 3.75 } })),
      getSnapshotsSince: vi.fn().mockResolvedValue([
        snapshot({
          fetched_at: '2026-10-01T06:00:00.000Z',
          provider_quote_date: '2026-10-01',
          rates: { SAR: 3.7 },
        }),
        snapshot({
          fetched_at: '2026-10-02T06:00:00.000Z',
          provider_quote_date: '2026-10-02',
          rates: { SAR: 3.75 },
        }),
      ]),
    });
    const { service } = makeService(repository);

    const series = await service.getSeries('sar', '1M');

    expect(series?.code).toBe('SAR');
    expect(series?.kind).toBe('currency');
    expect(series?.points).toEqual([
      { date: '2026-10-01', value: 3.7 },
      { date: '2026-10-02', value: 3.75 },
    ]);
  });

  it('returns null for an unknown code', async () => {
    const repository = makeRepo({
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot({ rates: { SAR: 3.75 } })),
    });
    const { service } = makeService(repository);

    await expect(service.getSeries('XYZ', '1M')).resolves.toBeNull();
  });
});

describe('RatesService.getHealth', () => {
  it('reports ok for a fresh run', async () => {
    const repository = makeRepo({
      getLastSuccessfulRun: vi
        .fn()
        .mockResolvedValue({ finished_at: '2026-10-04T06:00:00.000Z' } as RateSyncRun),
      getLatestSnapshot: vi.fn().mockResolvedValue(snapshot()),
    });
    const { service } = makeService(repository);

    const health = await service.getHealth();
    expect(health.ok).toBe(true);
    expect(health.stale).toBe(false);
  });

  it('reports stale when the last success is old', async () => {
    const repository = makeRepo({
      getLastSuccessfulRun: vi
        .fn()
        .mockResolvedValue({ finished_at: '2026-09-01T00:00:00.000Z' } as RateSyncRun),
      getLatestSnapshot: vi
        .fn()
        .mockResolvedValue(snapshot({ fetched_at: '2026-09-01T00:00:00.000Z' })),
    });
    const { service } = makeService(repository);

    const health = await service.getHealth();
    expect(health.ok).toBe(false);
    expect(health.stale).toBe(true);
  });
});
