import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  classifyScripts,
  summarizeRuntime,
  formatRuntimeVerdict,
  checkRuntimeBudget,
  measureRuntimeRoute,
} from '../perf-runtime-weight.mjs';

const ORIGIN = 'https://perf.local';

const entry = (pathname, gzip, body = '') => ({
  url: `${ORIGIN}${pathname}`,
  pathname,
  gzip,
  body,
});

function fakeBrowser({ html, scripts, failures = 0, probeScripts = [], documentStatus = 200 }) {
  let left = failures;
  return {
    contexts: 0,
    async newContext() {
      this.contexts += 1;
      const handlers = [];
      const page = {
        on: (_event, fn) => handlers.push(fn),
        off: (_event, fn) => {
          const index = handlers.indexOf(fn);
          if (index >= 0) handlers.splice(index, 1);
        },
        async evaluate() {
          for (const response of probeScripts) {
            for (const handler of handlers) handler(response);
          }
        },
        async goto(url) {
          if (left > 0) {
            left -= 1;
            throw new Error('socket hang up');
          }
          this.urlValue = url;
          const document = {
            url: () => url,
            status: () => documentStatus,
            text: async () => html,
            request: () => ({ isNavigationRequest: () => true }),
          };
          for (const response of [document, ...scripts]) {
            for (const handler of handlers) handler(response);
          }
        },
        async waitForTimeout() {},
        async content() {
          return html;
        },
        url() {
          return this.urlValue;
        },
        async close() {},
      };
      return {
        newPage: async () => page,
        route: async () => {},
        close: async () => {},
      };
    },
  };
}

const scriptResponse = (url, body) => ({
  url: () => `${ORIGIN}${url}`,
  request: () => ({ isNavigationRequest: () => false, resourceType: () => 'script' }),
  body: async () => Buffer.from(body),
});

describe('classifyScripts', () => {
  it('separates document-referenced scripts from chunks fetched after load', () => {
    const result = classifyScripts([entry('/doc.js', 100), entry('/lazy.js', 200)], ['/doc.js']);
    expect(result.map((script) => script.inDocument)).toEqual([true, false]);
  });

  it('marks a script as the reporter by its body markers, not its filename', () => {
    const result = classifyScripts(
      [entry('/hash-abc.js', 100, 'minified sentry.io transport')],
      [],
      ['sentry.io']
    );
    expect(result[0].reporter).toBe(true);
  });

  it('requires every marker in a matcher so a chunk with only the DSN is not the reporter', () => {
    const result = classifyScripts(
      [
        entry('/dsn.js', 100, 'sentry.io captureException'),
        entry('/sdk.js', 100, 'sentry.io captureException event_id'),
      ],
      [],
      [['sentry.io', 'event_id', 'captureException']]
    );
    expect(result.map((script) => script.reporter)).toEqual([false, true]);
  });
});

describe('summarizeRuntime', () => {
  it('totals document JS, after-load JS and the reporter from the same bytes', () => {
    const summary = summarizeRuntime([
      { inDocument: true, reporter: false, gzip: 1024 },
      { inDocument: false, reporter: false, gzip: 2048 },
      { inDocument: false, reporter: true, gzip: 5120 },
    ]);
    expect(summary).toEqual({ documentJs: 1024, afterLoadJs: 7168, totalJs: 8192, reporter: 5120 });
  });
});

describe('checkRuntimeBudget', () => {
  const result = (route, bytes) => ({
    route,
    summary: { documentJs: 0, afterLoadJs: bytes, totalJs: bytes, reporter: 0 },
  });

  it('uses the default ceiling when a route has no row', () => {
    expect(checkRuntimeBudget(result('/other', 100 * 1024), { default: { ceiling: 120 } }).ok).toBe(
      true
    );
    expect(checkRuntimeBudget(result('/other', 130 * 1024), { default: { ceiling: 120 } }).ok).toBe(
      false
    );
  });

  it('lets a route override the default and expands a pattern through weightSamples', () => {
    const artifact = {
      default: { ceiling: 200 },
      routes: { '/quran/[surah]': { ceiling: 160 }, '/quran/2': { ceiling: 150 } },
    };
    const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'] };
    expect(checkRuntimeBudget(result('/quran/1', 155 * 1024), artifact, weights).ok).toBe(true);
    expect(checkRuntimeBudget(result('/quran/2', 155 * 1024), artifact, weights).ok).toBe(false);
  });

  it('does not gate a route with no ceiling at all', () => {
    expect(checkRuntimeBudget(result('/ungated', 900 * 1024), {})).toEqual({
      ok: true,
      ceiling: null,
      actualKb: null,
    });
  });
});

describe('formatRuntimeVerdict', () => {
  it('prints the three gzip columns and fails a route above its ceiling', () => {
    const results = [
      {
        route: '/terms',
        summary: {
          documentJs: 200 * 1024,
          afterLoadJs: 190 * 1024,
          totalJs: 390 * 1024,
          reporter: 0,
        },
      },
    ];
    const report = formatRuntimeVerdict(results, { default: { ceiling: 180 } });
    expect(report).toContain('documentJs');
    expect(report).toContain('afterLoadJs');
    expect(report).toContain('totalJs');
    expect(report).toContain('190.0 KB');
    expect(report).toContain('OVER');
    expect(report).toContain('0 OK, 1 over budget across 1 route(s)');
  });
});

describe('measureRuntimeRoute', () => {
  const html = '<html><head><script src="/_next/static/chunks/doc.js"></script></head></html>';
  const scripts = [
    scriptResponse('/_next/static/chunks/doc.js', 'abc'.repeat(2000)),
    scriptResponse('/_next/static/chunks/lazy.js', 'sentry.io'.repeat(3000)),
  ];

  it('records every script response and its provenance from a fresh context', async () => {
    const browser = fakeBrowser({ html, scripts });
    const measured = await measureRuntimeRoute('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      reporterMatchers: [['sentry.io']],
    });

    expect(measured.scripts.map((script) => script.inDocument)).toEqual([true, false]);
    expect(measured.scripts.map((script) => script.reporter)).toEqual([false, true]);
    expect(measured.scripts.every((script) => script.gzip > 0)).toBe(true);
    expect(measured.summary.documentJs).toBe(gzipSync(Buffer.from('abc'.repeat(2000))).length);
    expect(measured.summary.afterLoadJs).toBe(
      gzipSync(Buffer.from('sentry.io'.repeat(3000))).length
    );
    expect(measured.summary.reporter).toBe(measured.summary.afterLoadJs);
  });

  it('ignores cross-origin scripts and does not wait on a warm cache', async () => {
    const crossOrigin = {
      url: () => 'https://cdn.example.com/a.js',
      request: () => ({ isNavigationRequest: () => false, resourceType: () => 'script' }),
      body: async () => Buffer.from('not priced'),
    };
    const browser = fakeBrowser({ html, scripts: [scripts[0], crossOrigin] });
    const measured = await measureRuntimeRoute('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
    });
    expect(measured.scripts).toHaveLength(1);
  });

  it('retries a transient navigation failure and still prices the route', async () => {
    const browser = fakeBrowser({ html, scripts, failures: 1 });
    const sleepFn = vi.fn(() => Promise.resolve());
    const measured = await measureRuntimeRoute('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      sleepFn,
    });
    expect(browser.contexts).toBe(2);
    expect(sleepFn).toHaveBeenCalledOnce();
    expect(measured.summary.totalJs).toBeGreaterThan(0);
  });

  it('names an origin 5xx and retries it instead of pricing a script-less error page', async () => {
    const browser = fakeBrowser({
      html: '<html><head></head><body></body></html>',
      scripts: [],
      documentStatus: 503,
    });
    const sleepFn = vi.fn(() => Promise.resolve());

    await expect(
      measureRuntimeRoute('/hire', {
        origin: ORIGIN,
        browser,
        settleMs: 0,
        sleepFn,
      })
    ).rejects.toThrow(/Origin returned HTTP 503 for \/hire/);
    expect(browser.contexts).toBe(7);
    expect(sleepFn).toHaveBeenCalledTimes(6);
  });

  it('names a 5xx even when the edge sends an empty document body', async () => {
    const browser = fakeBrowser({ html: '', scripts: [], documentStatus: 503 });

    await expect(
      measureRuntimeRoute('/hire', {
        origin: ORIGIN,
        browser,
        settleMs: 0,
        sleepFn: vi.fn(() => Promise.resolve()),
      })
    ).rejects.toThrow(/Origin returned HTTP 503 for \/hire/);
  });

  it('reports the document status when a non-5xx error page carries no scripts', async () => {
    const browser = fakeBrowser({
      html: '<html><head></head><body></body></html>',
      scripts: [],
      documentStatus: 404,
    });

    await expect(
      measureRuntimeRoute('/missing', {
        origin: ORIGIN,
        browser,
        settleMs: 0,
        sleepFn: vi.fn(() => Promise.resolve()),
      })
    ).rejects.toThrow(/No script responses observed for \/missing.*document HTTP 404/);
  });

  it('prices the reporter fetched by an error probe without counting it in the clean load', async () => {
    const browser = fakeBrowser({
      html,
      scripts: [scripts[0]],
      probeScripts: [scriptResponse('/sentry-client.js', 'event_id getCurrentScope')],
    });
    const measured = await measureRuntimeRoute('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      reporterMatchers: [['event_id', 'getCurrentScope']],
      probeError: true,
    });

    expect(measured.summary.reporter).toBe(0);
    expect(measured.summary.afterLoadJs).toBe(0);
    const body = Buffer.from('event_id getCurrentScope');
    expect(measured.reporterOnError).toBe(Math.min(gzipSync(body).length, body.length));
  });
});
