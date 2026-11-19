import { describe, it, expect } from 'vitest';
import { parseLog, percentile, summarize } from '../perf-shell.mjs';

/**
 * The shell's launch gate reads `RoyLaunch` lines, not a browser measure (#1639).
 * The parser is the part a pull request can prove: a launch counts only when the
 * page reported both its own zero point and the owned-row paint, and the p75 is
 * nearest-rank, the same rule the field report uses.
 */
const line = (pid, moment, ms) =>
  `11-19 15:22:48.358 ${pid} ${pid} D RoyLaunch: ${moment} at ${ms}ms`;

describe('the shell launch log', () => {
  it('groups one launch per process and subtracts the page zero point', () => {
    const launches = parseLog(
      [
        line(100, 'onCreate', 300),
        line(100, 'page committed', 2200),
        line(100, 'boot mark', 1900),
        line(100, 'shell mark', 2100),
        line(100, 'content mark', 9900),
      ].join('\n')
    );
    expect(launches).toEqual([
      { commitMs: 2200, shellMs: 200, contentMs: 8000, forkToContentMs: 9900 },
    ]);
  });

  it('drops a document that never painted owned rows', () => {
    expect(
      parseLog([line(100, 'onCreate', 300), line(100, 'page committed', 2200)].join('\n'))
    ).toEqual([]);
  });

  it('uses nearest-rank p75 over the launches that did paint', () => {
    const launches = [
      { commitMs: 2000, shellMs: 200, contentMs: 700, forkToContentMs: 3000 },
      { commitMs: 2100, shellMs: 210, contentMs: 900, forkToContentMs: 3300 },
      { commitMs: 2200, shellMs: 220, contentMs: 1100, forkToContentMs: 3500 },
      { commitMs: 2300, shellMs: 230, contentMs: 1300, forkToContentMs: 3700 },
    ];
    expect(percentile([1, 2, 3, 4])).toBe(3);
    expect(summarize(launches)).toEqual({
      n: 4,
      commitP75: 2200,
      shellP75: 220,
      contentP75: 1100,
    });
  });
});
