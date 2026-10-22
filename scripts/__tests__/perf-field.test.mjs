import { describe, expect, it } from 'vitest';
import { formatTable, parseRecord, percentile, readRecords, summarize } from '../perf-field.mjs';

const LAUNCH = {
  version: 1,
  kind: 'launch',
  platform: 'shell',
  cold: true,
  shellMs: 400,
  contentMs: 820,
};
const TAP = { version: 1, kind: 'tap', platform: 'web', paintMs: 38 };

/** A Vercel JSON log line, with the record where `logger.info` puts it. */
function line(payload) {
  return JSON.stringify({
    level: 'info',
    message: `[INFO] [app-perf] ${JSON.stringify(payload)}`,
    timestamp: 1_700_000_000_000,
  });
}

describe('parseRecord', () => {
  it('reads a launch and a tap out of the log message', () => {
    expect(parseRecord(line(LAUNCH))).toEqual({
      kind: 'launch',
      platform: 'shell',
      cold: true,
      shellMs: 400,
      contentMs: 820,
    });
    expect(parseRecord(line(TAP))).toEqual({ kind: 'tap', platform: 'web', paintMs: 38 });
  });

  it('finds the record whatever field the CLI puts the message in', () => {
    const entry = JSON.stringify({ text: `[app-perf] ${JSON.stringify(TAP)}` });
    expect(parseRecord(entry)).toEqual({ kind: 'tap', platform: 'web', paintMs: 38 });
  });

  it('drops anything it cannot read rather than guessing', () => {
    for (const input of [
      'not json',
      JSON.stringify({ message: 'a request line' }),
      line({ ...LAUNCH, platform: 'desktop' }),
      line({ ...LAUNCH, kind: 'unknown' }),
      line({ ...LAUNCH, contentMs: -1 }),
      line({ ...TAP, paintMs: 'fast' }),
    ]) {
      expect(parseRecord(input)).toBeNull();
    }
  });
});

describe('percentile', () => {
  it('uses the nearest rank, so every value is one of the samples', () => {
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([42], 0.75)).toBe(42);
    expect(percentile([], 0.75)).toBeNull();
  });
});

describe('summarize', () => {
  it('splits launches by platform and cold/warm, and taps by platform', () => {
    const rows = summarize([
      { kind: 'launch', platform: 'web', cold: true, shellMs: 500, contentMs: 1000 },
      { kind: 'launch', platform: 'web', cold: true, shellMs: 100, contentMs: 300 },
      { kind: 'launch', platform: 'web', cold: false, shellMs: 40, contentMs: 90 },
      { kind: 'launch', platform: 'shell', cold: false, shellMs: 20, contentMs: 60 },
      { kind: 'tap', platform: 'web', paintMs: 20 },
      { kind: 'tap', platform: 'web', paintMs: 60 },
      { kind: 'tap', platform: 'web', paintMs: 40 },
      { kind: 'tap', platform: 'shell', paintMs: 30 },
    ]);

    expect(rows).toEqual([
      {
        kind: 'launch',
        platform: 'web',
        cold: true,
        samples: 2,
        shellMs: 500,
        contentMs: 1000,
        paintMs: null,
      },
      {
        kind: 'launch',
        platform: 'web',
        cold: false,
        samples: 1,
        shellMs: 40,
        contentMs: 90,
        paintMs: null,
      },
      {
        kind: 'launch',
        platform: 'shell',
        cold: false,
        samples: 1,
        shellMs: 20,
        contentMs: 60,
        paintMs: null,
      },
      {
        kind: 'tap',
        platform: 'web',
        cold: null,
        samples: 3,
        shellMs: null,
        contentMs: null,
        paintMs: 60,
      },
      {
        kind: 'tap',
        platform: 'shell',
        cold: null,
        samples: 1,
        shellMs: null,
        contentMs: null,
        paintMs: 30,
      },
    ]);
  });

  it('lists platforms in the order the contract names them', () => {
    const rows = summarize([
      { kind: 'tap', platform: 'shell', paintMs: 1 },
      { kind: 'tap', platform: 'pwa', paintMs: 1 },
      { kind: 'tap', platform: 'web', paintMs: 1 },
    ]);

    expect(rows.map((row) => row.platform)).toEqual(['web', 'pwa', 'shell']);
  });
});

describe('readRecords', () => {
  it('counts the lines it could not use', () => {
    const text = [line(LAUNCH), '{broken', '', line(TAP)].join('\n');

    const { records, ignored } = readRecords(text);

    expect(records).toHaveLength(2);
    expect(ignored).toBe(1);
  });
});

describe('formatTable', () => {
  it('prints the three numbers with a dash where a group has none', () => {
    const table = formatTable(summarize([LAUNCH, TAP]));

    expect(table).toContain('content p75');
    expect(table).toContain('820 ms');
    expect(table).toContain('38 ms');
    expect(table).toContain('cold');
  });
});
