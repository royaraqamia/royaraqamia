import { describe, expect, it, vi } from 'vitest';

import { AppPerfService, toSample } from '@/backend/services/observability/app-perf-service';

/**
 * The mapping is the whole service: a validated record becomes one row whose
 * columns are the kind's own, and every column the kind does not own is `null`.
 * The table's `perf_samples_shape` check reads exactly that (#1885, ADR-0228).
 */

const launch = {
  version: 1 as const,
  kind: 'launch' as const,
  platform: 'shell' as const,
  cold: true,
  shellMs: 400,
  contentMs: 820,
};
const tap = { version: 1 as const, kind: 'tap' as const, platform: 'web' as const, paintMs: 38 };
const vitals = {
  version: 1 as const,
  kind: 'vitals' as const,
  platform: 'pwa' as const,
  lcpMs: 2100,
  cls: 0.04,
  inpMs: 120,
  ttfbMs: 300,
};

const empty = {
  cold: null,
  shellMs: null,
  contentMs: null,
  paintMs: null,
  lcpMs: null,
  cls: null,
  inpMs: null,
  ttfbMs: null,
};

describe('toSample', () => {
  it('keeps a launch to its platform, flag and two durations', () => {
    expect(toSample(launch)).toEqual({
      ...empty,
      kind: 'launch',
      platform: 'shell',
      cold: true,
      shellMs: 400,
      contentMs: 820,
    });
  });

  it('keeps a tap to the one duration it has', () => {
    expect(toSample(tap)).toEqual({
      ...empty,
      kind: 'tap',
      platform: 'web',
      paintMs: 38,
    });
  });

  it('keeps vitals to their four numbers', () => {
    expect(toSample(vitals)).toEqual({
      ...empty,
      kind: 'vitals',
      platform: 'pwa',
      lcpMs: 2100,
      cls: 0.04,
      inpMs: 120,
      ttfbMs: 300,
    });
  });
});

describe('AppPerfService', () => {
  it('records the mapped row through the repository', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const service = new AppPerfService({ samples: { record } });

    await service.record(tap);

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tap', paintMs: 38 }));
  });

  it('lets a repository failure reach the controller, which decides the beacon is droppable', async () => {
    const record = vi.fn().mockRejectedValue(new Error('unavailable'));
    const service = new AppPerfService({ samples: { record } });

    await expect(service.record(tap)).rejects.toThrow('unavailable');
  });
});
