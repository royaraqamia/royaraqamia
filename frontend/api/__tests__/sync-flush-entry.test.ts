import { describe, expect, it, vi } from 'vitest';

import { DRAINABLE_PRODUCTS } from '@/frontend/api/sync-products';
import {
  reportToShell,
  runSyncFlushPage,
  summarizeOutcomes,
  SHELL_SYNC_BRIDGE,
  type SyncFlushReport,
} from '@/frontend/api/sync-flush-entry';

const REPORT: SyncFlushReport = {
  outcomes: [],
  pending: 0,
  failed: 0,
  error: null,
};

describe('summarizeOutcomes', () => {
  it('totals what is left across products, and keeps the first reason', () => {
    const report = summarizeOutcomes([
      { product: 'habitflow', replayed: 1, pending: 2, failed: 0, error: null },
      { product: 'spendtrack', replayed: 0, pending: 0, failed: 1, error: 'store is newer' },
      { product: 'leads', replayed: 0, pending: 3, failed: 0, error: 'offline' },
    ]);

    expect(report.pending).toBe(5);
    expect(report.failed).toBe(1);
    expect(report.error).toBe('store is newer');
  });

  it('says nothing when nothing is left', () => {
    const report = summarizeOutcomes([
      { product: 'habitflow', replayed: 2, pending: 0, failed: 0, error: null },
    ]);

    expect(report).toMatchObject({ pending: 0, failed: 0, error: null });
  });
});

describe('runSyncFlushPage', () => {
  it('drains the same registry the service worker drains, for the session', async () => {
    const drain = vi
      .fn()
      .mockResolvedValue([
        { product: 'habitflow', replayed: 1, pending: 0, failed: 0, error: null },
      ]);

    const report = await runSyncFlushPage({
      session: async () => ({ userId: 'u-1' }),
      databases: async () => ['habitflow:user:u-1'],
      drain,
    });

    expect(drain).toHaveBeenCalledWith({
      session: { userId: 'u-1' },
      products: DRAINABLE_PRODUCTS,
      existingDatabases: ['habitflow:user:u-1'],
    });
    expect(report.pending).toBe(0);
    expect(report.outcomes).toHaveLength(1);
  });

  it('drains a guest queue when no session answers', async () => {
    // Leads are the guest namespace: a project request made signed out is
    // meaningful on its own (see `DRAINABLE_PRODUCTS`).
    const drain = vi.fn().mockResolvedValue([]);

    await runSyncFlushPage({ session: async () => null, databases: async () => [], drain });

    expect(drain).toHaveBeenCalledWith(
      expect.objectContaining({ session: null, products: DRAINABLE_PRODUCTS })
    );
  });

  it('reports a failed session lookup instead of throwing it at the worker', async () => {
    const drain = vi.fn();

    const report = await runSyncFlushPage({
      session: async () => {
        throw new Error('session lookup failed (503)');
      },
      databases: async () => null,
      drain,
    });

    expect(drain).not.toHaveBeenCalled();
    expect(report.error).toMatch(/session lookup failed/);
    expect(report.pending).toBe(0);
  });

  it('reports a drain that threw, which the worker reads as "come back"', async () => {
    const report = await runSyncFlushPage({
      session: async () => ({ userId: 'u-1' }),
      databases: async () => null,
      drain: async () => {
        throw new Error('the connection was disposed');
      },
    });

    expect(report.error).toBe('the connection was disposed');
  });
});

describe('reportToShell', () => {
  it('answers false in a browser, where nobody is listening', () => {
    expect(reportToShell(REPORT, {})).toBe(false);
  });

  it('hands the worker the report as JSON', () => {
    const report = vi.fn();

    expect(reportToShell(REPORT, { [SHELL_SYNC_BRIDGE]: { report } })).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
    expect(JSON.parse(report.mock.calls[0]![0])).toEqual(REPORT);
  });
});
