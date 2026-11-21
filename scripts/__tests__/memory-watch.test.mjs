import { describe, expect, it } from 'vitest';

import { summarize } from '../memory-watch.mjs';

const NOW = new Date('2026-11-21T12:00:00Z');
const mb = (value) => Math.round(value * 1024 * 1024);

function series(values) {
  return [
    {
      labels: [],
      unit: 'bytes',
      values: values.map((value, i) => ({
        timestamp: new Date(NOW.getTime() - (values.length - i) * 60000).toISOString(),
        value: mb(value),
      })),
    },
  ];
}

describe('the origin memory watch', () => {
  it('stays quiet when memory is flat and nothing was killed', () => {
    const report = summarize(series([300, 310, 320, 305]), [], { now: NOW });

    expect(report.alert).toBe(false);
    expect(report.reasons).toEqual([]);
    expect(report.p95Mb).toBe(320);
    expect(report.maxMb).toBe(320);
    expect(report.oomCount).toBe(0);
  });

  it('raises an alert on an OOM restart even when the graph looks calm', () => {
    const events = [
      {
        type: 'server_failed',
        timestamp: '2026-11-20T12:33:33Z',
        details: { reason: { oomKilled: { memoryLimit: '512Mi' } } },
      },
    ];

    const report = summarize(series([250, 260, 255]), events, { now: NOW });

    expect(report.alert).toBe(true);
    expect(report.reasons).toContain('1 OOM restart(s)');
    expect(report.oomAt).toEqual(['2026-11-20T12:33:33Z']);
  });

  it('raises an alert when the graph sits above the documented threshold', () => {
    const report = summarize(series([360, 390, 401, 410]), [], { now: NOW, thresholdMb: 400 });

    expect(report.alert).toBe(true);
    expect(report.reasons).toContain('p95 410 MiB at or above 400 MiB');
  });

  it('ignores a failed server that was not killed for memory', () => {
    const events = [
      {
        type: 'server_failed',
        timestamp: '2026-11-20T12:00:00Z',
        details: { reason: { evicted: true } },
      },
    ];

    expect(summarize(series([300]), events, { now: NOW }).alert).toBe(false);
  });

  it('reports no percentile when the API returned no samples', () => {
    const report = summarize([], [], { now: NOW });

    expect(report.p95Mb).toBeNull();
    expect(report.maxMb).toBeNull();
    expect(report.alert).toBe(false);
  });
});
