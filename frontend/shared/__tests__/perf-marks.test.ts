import { describe, expect, it, vi } from 'vitest';
import {
  createAppPerfMarks,
  detectAppPerfPlatform,
  detectColdLaunch,
  APP_PERF_MARK,
} from '@/frontend/shared/perf-marks';
import type { AppPerfReport } from '@/shared/contracts/app-perf';

/**
 * A User Timing stub with a clock: marks are timestamps, so a duration is the
 * distance the test moves the clock between them.
 */
function userTiming() {
  const marks = new Map<string, number>();
  let now = 0;

  return {
    perf: {
      mark(name: string) {
        marks.set(name, now);
      },
      measure(_name: string, start?: string, end?: string) {
        const from = start === undefined ? 0 : marks.get(start);
        const to = end === undefined ? now : marks.get(end);
        if (from === undefined || to === undefined) throw new Error('missing mark');
        return { duration: to - from };
      },
      clearMarks(name?: string) {
        if (name === undefined) marks.clear();
        else marks.delete(name);
      },
      clearMeasures() {},
    },
    advance(ms: number) {
      now += ms;
    },
    marks,
  };
}

function harness(overrides: Parameters<typeof createAppPerfMarks>[0] = {}) {
  const timing = userTiming();
  const sent: AppPerfReport[] = [];

  const marks = createAppPerfMarks({
    perf: timing.perf,
    platform: 'web',
    cold: true,
    isOnline: () => true,
    afterPaint: (run) => run(),
    defer: (run) => run(),
    send: (report) => sent.push(report),
    ...overrides,
  });

  return { marks, timing, sent };
}

/** The default send path: a stubbed `fetch` instead of a captured record. */
function beacon(overrides: Parameters<typeof createAppPerfMarks>[0] = {}) {
  const timing = userTiming();
  const fetchImpl = vi.fn(async () => ({ ok: true }) as Response);
  const marks = createAppPerfMarks({
    perf: timing.perf,
    platform: 'web',
    cold: true,
    fetchImpl,
    isOnline: () => true,
    afterPaint: (run) => run(),
    defer: (run) => run(),
    ...overrides,
  });

  return { marks, timing, fetchImpl };
}

describe('app perf marks', () => {
  it('sends one launch record with boot → shell and boot → content', () => {
    const timing = userTiming();
    const sent: AppPerfReport[] = [];
    const marks = createAppPerfMarks({
      perf: timing.perf,
      platform: 'pwa',
      cold: false,
      send: (report) => sent.push(report),
      afterPaint: (run) => run(),
    });

    marks.markBoot();
    timing.advance(40);
    marks.markShell();
    timing.advance(85);
    marks.markContent();

    expect(sent).toEqual([
      { version: 1, kind: 'launch', platform: 'pwa', cold: false, shellMs: 40, contentMs: 125 },
    ]);
  });

  it('writes the marks a profiler can read, once each', () => {
    const { marks, timing } = harness();

    marks.markBoot();
    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    marks.markShell();
    timing.advance(10);
    marks.markContent();

    expect([...timing.marks.keys()]).toEqual([
      APP_PERF_MARK.boot,
      APP_PERF_MARK.shell,
      APP_PERF_MARK.content,
    ]);
  });

  it('reports only the first content surface of a launch', () => {
    const { marks, timing, sent } = harness();

    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    timing.advance(10);
    marks.markContent();
    timing.advance(500);
    marks.markContent();

    expect(sent).toHaveLength(1);
  });

  it('keeps the durations ordered when a content surface marks before the shell', () => {
    const { marks, timing, sent } = harness();

    marks.markBoot();
    timing.advance(25);
    marks.markContent();

    expect(sent).toHaveLength(1);
    const report = sent[0] as Extract<AppPerfReport, { kind: 'launch' }>;
    expect(report.shellMs).toBeLessThanOrEqual(report.contentMs);
    expect(timing.marks.has(APP_PERF_MARK.shell)).toBe(true);
  });

  it('drops a launch that took longer than the accepted ceiling', () => {
    const { marks, timing, sent } = harness();

    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    timing.advance(700_000);
    marks.markContent();

    expect(sent).toEqual([]);
  });

  it('reports one tap record per local mutation and clears its marks', () => {
    const { marks, timing, sent } = harness();

    marks.markBoot();
    const first = marks.beginTap();
    timing.advance(35);
    first();
    const second = marks.beginTap();
    timing.advance(12);
    second();

    expect(sent).toEqual([
      { version: 1, kind: 'tap', platform: 'web', paintMs: 35 },
      { version: 1, kind: 'tap', platform: 'web', paintMs: 12 },
    ]);
    const leftover = [...timing.marks.keys()].filter((name) => name.includes('tap'));
    expect(leftover).toEqual([]);
  });

  it('finishes a tap once, so a double call cannot double count', () => {
    const { marks, sent } = harness();

    const painted = marks.beginTap();
    painted();
    painted();

    expect(sent).toHaveLength(1);
  });

  it('drops a tap whose paint came after the app sat in the background', () => {
    const { marks, timing, sent } = harness();

    const painted = marks.beginTap();
    timing.advance(61_000);
    painted();

    expect(sent).toEqual([]);
  });

  it('never sends while offline', () => {
    const { marks, timing, fetchImpl } = beacon({ isOnline: () => false });

    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    marks.markContent();
    marks.beginTap()();

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('beacons after the paint, kept alive, without credentials', () => {
    const { marks, timing, fetchImpl } = beacon();

    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    timing.advance(10);
    marks.markContent();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/app-perf');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
  });

  it('carries nothing that could name a person, a page or a session', () => {
    const { marks, timing, fetchImpl } = beacon();
    const allowed = new Set([
      'version',
      'kind',
      'platform',
      'cold',
      'shellMs',
      'contentMs',
      'paintMs',
    ]);

    marks.markBoot();
    timing.advance(10);
    marks.markShell();
    marks.markContent();
    marks.beginTap()();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      const body = JSON.parse(String((call as unknown as [string, RequestInit])[1].body));
      expect(Object.keys(body).every((key) => allowed.has(key))).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/"(url|path|page|user|userId|session|clientId)"/);
    }
  });

  it('survives a WebView with no User Timing at all', () => {
    const marks = createAppPerfMarks({
      perf: {
        mark: () => {
          throw new Error('no user timing');
        },
        measure: () => {
          throw new Error('no user timing');
        },
        clearMarks: () => {},
        clearMeasures: () => {},
      },
      send: vi.fn(),
      afterPaint: (run) => run(),
    });

    expect(() => {
      marks.markBoot();
      marks.markShell();
      marks.markContent();
      marks.beginTap()();
    }).not.toThrow();
  });
});

describe('detectAppPerfPlatform', () => {
  it('calls the native shell a shell, by bridge or by user agent', () => {
    expect(detectAppPerfPlatform({ native: true, userAgent: '', standalone: false })).toBe('shell');
    expect(
      detectAppPerfPlatform({ native: false, userAgent: 'Mozilla/5.0 RoyaraqamiaShell/1.2.3+7' })
    ).toBe('shell');
  });

  it('reads an installed app as pwa and a browser tab as web', () => {
    expect(
      detectAppPerfPlatform({ native: false, userAgent: 'Mozilla/5.0', standalone: true })
    ).toBe('pwa');
    expect(
      detectAppPerfPlatform({ native: false, userAgent: 'Mozilla/5.0', standalone: false })
    ).toBe('web');
  });
});

describe('detectColdLaunch', () => {
  it('treats a document that crossed the network as cold', () => {
    expect(detectColdLaunch({ type: 'navigate', transferSize: 42_000 })).toBe(true);
  });

  it('treats a cached document, a reload and a back navigation as warm', () => {
    expect(detectColdLaunch({ type: 'navigate', transferSize: 0 })).toBe(false);
    expect(detectColdLaunch({ type: 'reload', transferSize: 42_000 })).toBe(false);
    expect(detectColdLaunch({ type: 'back_forward', transferSize: 0 })).toBe(false);
  });

  it('defaults to cold when the browser reports no navigation entry', () => {
    expect(detectColdLaunch(null)).toBe(true);
  });
});
