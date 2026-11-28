import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import {
  classifyScripts,
  summarizeRuntime,
  formatRuntimeVerdict,
  checkRuntimeBudget,
  measureRuntimeRoute,
  measureRuntimeSurface,
  warmHintFor,
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
    contextOptions: [],
    async newContext(options = {}) {
      this.contexts += 1;
      this.contextOptions.push(options);
      const active = typeof scripts === 'function' ? scripts(options) : scripts;
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
          for (const response of [document, ...active]) {
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
  const result = (route, bytes, returningBytes = null) => ({
    route,
    summary: { documentJs: 0, afterLoadJs: bytes, totalJs: bytes, reporter: 0 },
    returning:
      returningBytes === null
        ? null
        : {
            summary: {
              documentJs: 0,
              afterLoadJs: returningBytes,
              totalJs: returningBytes,
              reporter: 0,
            },
          },
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

  it('gates the worse of the cold and returning columns', () => {
    const artifact = { default: { ceiling: 200 } };
    // A cold visit inside the ceiling, a returning one past it: the returning
    // column is the state the member is actually in, so it decides.
    const returned = result('/other', 100 * 1024, 230 * 1024);
    const verdict = checkRuntimeBudget(returned, artifact);
    expect(verdict.ok).toBe(false);
    expect(verdict.coldKb).toBe(100);
    expect(verdict.returningKb).toBe(230);
    expect(verdict.actualKb).toBe(230);

    // A returning column lighter than the cold one cannot hide a breach.
    const cold = result('/other', 230 * 1024, 100 * 1024);
    expect(checkRuntimeBudget(cold, artifact).ok).toBe(false);
  });

  it('does not gate a route with no ceiling at all', () => {
    expect(checkRuntimeBudget(result('/ungated', 900 * 1024), {})).toEqual({
      ok: true,
      ceiling: null,
      actualKb: null,
      coldKb: null,
      returningKb: null,
    });
  });
});

describe('formatRuntimeVerdict', () => {
  it('prints the cold and returning columns and fails a route above its ceiling', () => {
    const results = [
      {
        route: '/terms',
        summary: {
          documentJs: 200 * 1024,
          afterLoadJs: 47 * 1024,
          totalJs: 247 * 1024,
          reporter: 0,
        },
        returning: {
          summary: {
            documentJs: 200 * 1024,
            afterLoadJs: 231 * 1024,
            totalJs: 431 * 1024,
            reporter: 0,
          },
        },
      },
    ];
    const report = formatRuntimeVerdict(results, { default: { ceiling: 180 } });
    expect(report).toContain('cold');
    expect(report).toContain('returning');
    expect(report).toContain('47.0 KB');
    expect(report).toContain('231.0 KB');
    expect(report).toContain('OVER');
    expect(report).toContain('0 OK, 1 over budget across 1 route(s)');
  });

  it('prints a dash for a surface whose door cannot act on the hint', () => {
    const results = [
      {
        route: '/auth/login',
        summary: { documentJs: 0, afterLoadJs: 211 * 1024, totalJs: 211 * 1024, reporter: 0 },
        returning: null,
      },
    ];
    const report = formatRuntimeVerdict(results, { default: { ceiling: 220 } });
    expect(report).toContain('returning —');
    expect(report).toContain('OK');
  });
});

describe('warmHintFor', () => {
  const artifact = {
    warmHint: { localStorage: { 'royaraqamia:assistant:opened': '1' } },
    routes: {
      '/quran/[surah]': { ceiling: 300 },
      '/chats/[id]': { ceiling: 200, warmHint: false },
      '/spendtrack': { ceiling: 400, warmHint: { localStorage: { other: '1' } } },
    },
  };
  const weights = { '/quran/[surah]': ['/quran/1', '/quran/2'], '/chats/[id]': '/chats/new' };

  it('seeds the artifact hint on a surface that has no row of its own', () => {
    expect(warmHintFor('/', artifact)).toEqual({
      localStorage: { 'royaraqamia:assistant:opened': '1' },
    });
  });

  it('expands a pattern row, so a sample inherits the surface decision', () => {
    expect(warmHintFor('/quran/2', artifact, weights)).toEqual({
      localStorage: { 'royaraqamia:assistant:opened': '1' },
    });
  });

  it('lets a row opt out and a row override the entries', () => {
    expect(warmHintFor('/chats/new', artifact, weights)).toBeNull();
    expect(warmHintFor('/spendtrack', artifact)).toEqual({ localStorage: { other: '1' } });
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

  it('seeds the storage entries in the context the hint names', async () => {
    const browser = fakeBrowser({ html, scripts });
    await measureRuntimeRoute('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      storage: { localStorage: { 'royaraqamia:assistant:opened': '1' } },
    });

    expect(browser.contextOptions[0].storageState).toEqual({
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
          localStorage: [{ name: 'royaraqamia:assistant:opened', value: '1' }],
        },
      ],
    });
  });
});

describe('measureRuntimeSurface', () => {
  const html = '<html><head><script src="/_next/static/chunks/doc.js"></script></head></html>';
  const doc = scriptResponse('/_next/static/chunks/doc.js', 'abc'.repeat(2000));
  // The panel chunk a returning reader warms while idle: incompressible, so the
  // column has to show it rather than a compressed echo of it.
  const panel = scriptResponse('/_next/static/chunks/editor.js', randomBytes(400_000));

  it('measures a cold visit and a hinted one, and the hint prices the warmed chunk', async () => {
    const browser = fakeBrowser({
      html,
      scripts: (options) => (options.storageState ? [doc, panel] : [doc]),
    });
    const measured = await measureRuntimeSurface('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      hint: { localStorage: { 'royaraqamia:assistant:opened': '1' } },
    });

    expect(browser.contexts).toBe(2);
    expect(measured.summary.afterLoadJs).toBe(0);
    expect(measured.returning.summary.afterLoadJs / 1024).toBeGreaterThan(120);
    expect(
      (measured.returning.summary.afterLoadJs - measured.summary.afterLoadJs) / 1024
    ).toBeGreaterThan(120);
  });

  it('measures a surface that cannot act on the hint once', async () => {
    const browser = fakeBrowser({ html, scripts: [doc] });
    const measured = await measureRuntimeSurface('/', {
      origin: ORIGIN,
      browser,
      settleMs: 0,
      hint: null,
    });

    expect(browser.contexts).toBe(1);
    expect(measured.returning).toBeNull();
  });
});
