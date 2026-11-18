import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { signIn } from './sign-in';

/**
 * User-felt performance evidence for the four main pages and the first tab.
 *
 * A production build, a mid-tier phone's worth of CPU and network throttling,
 * and one JSON record per route. This is the lab half of the runtime budget in
 * `docs/performance.md` — field RUM remains the authority, but unlike field
 * data this can be run before a change ships. It measures, it does not gate:
 * a number here is evidence to compare with the recorded baseline, not a
 * pass/fail line in CI.
 *
 * Run with `npm run perf:pages` (or PERF_PAGES=1 with an existing server).
 */

const ENABLED = process.env.PERF_PAGES === '1';
const OUT = process.env.PERF_PAGES_OUT ?? 'node_modules/.playwright/perf-pages.json';
const ROUTES = [
  { id: 'home', path: '/', auth: false },
  { id: 'home-habitflow', path: '/?tab=/habitflow', auth: false },
  { id: 'community-member', path: '/community', auth: true },
  { id: 'community-explore', path: '/community/explore', auth: false },
  { id: 'account', path: '/account', auth: true },
  { id: 'notifications', path: '/notifications', auth: true },
] as const;

test.skip(!ENABLED, 'requires PERF_PAGES=1');

let storageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

test.beforeAll(async ({ browser, baseURL }) => {
  if (!process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD) return;
  const context = await browser.newContext();
  await signIn(context, baseURL!);
  storageState = await context.storageState();
  await context.close();
});

const collected: Record<string, unknown> = {};

async function sample(browser: Browser, path: string, auth: boolean, baseURL: string) {
  const context = await browser.newContext({
    ...(auth && storageState ? { storageState } : {}),
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ar',
  });
  try {
    const page: Page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const state = { lcp: 0, cls: 0, longTasks: 0, longTaskMs: 0, inp: 0, shifts: 0 };
      w.__perfState = state;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) state.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch {
        // An engine without this entry type simply has no number for it.
      }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
              state.cls += (entry as PerformanceEntry & { value: number }).value;
              state.shifts += 1;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // CLS is optional on engines without LayoutShift.
      }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            state.longTasks += 1;
            state.longTaskMs += entry.duration;
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Long-task timing is Chromium-only; the other numbers still land.
      }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as PerformanceEntry & { duration: number; interactionId?: number };
            if (e.interactionId && e.duration > state.inp) state.inp = e.duration;
          }
        }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as never);
      } catch {
        // INP needs real interactions; this observer only records any that occur.
      }
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const started = Date.now();
    await page.goto(`${baseURL}${path}`, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForTimeout(2500);
    const wall = Date.now() - started;

    return await page
      .evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as
          (PerformanceNavigationTiming & { responseStart: number }) | undefined;
        const state =
          (window as unknown as { __perfState?: Record<string, number> }).__perfState ?? {};
        const measure = (name: string) => {
          const entry = performance.getEntriesByName(name, 'measure')[0];
          return entry ? Math.round(entry.duration) : null;
        };
        const bytes: Record<string, number> = {};
        let total = 0;
        for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
          const kind = r.initiatorType || 'other';
          const size = r.transferSize || r.encodedBodySize || 0;
          bytes[kind] = (bytes[kind] ?? 0) + size;
          total += size;
        }
        return {
          ttfb: nav ? Math.round(nav.responseStart) : null,
          dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          load: nav ? Math.round(nav.loadEventEnd) : null,
          lcp: Math.round(state.lcp ?? 0),
          cls: Math.round((state.cls ?? 0) * 1000) / 1000,
          shifts: state.shifts ?? 0,
          longTasks: state.longTasks ?? 0,
          longTaskMs: Math.round(state.longTaskMs ?? 0),
          inp: Math.round(state.inp ?? 0),
          shell: measure('roya:boot-to-shell'),
          content: measure('roya:boot-to-content'),
          bytes,
          bytesTotal: total,
          requests: performance.getEntriesByType('resource').length,
          domNodes: document.querySelectorAll('*').length,
          busy: document.querySelectorAll('[aria-busy="true"]').length,
          textLength: document.body.innerText.length,
        };
      })
      .then((metrics) => ({ ...metrics, wall }));
  } finally {
    await context.close();
  }
}

for (const route of ROUTES) {
  test(`baseline ${route.id}`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const runs: Awaited<ReturnType<typeof sample>>[] = [];
    for (let i = 0; i < 5; i += 1) {
      const value = await sample(browser, route.path, route.auth, baseURL!);
      if (i > 0) runs.push(value);
    }
    const medianOf = (key: string) => {
      const values = runs
        .map((r) => (r as unknown as Record<string, number>)[key])
        .filter((v): v is number => typeof v === 'number' && v > 0)
        .sort((a, b) => a - b);
      return values.length ? values[Math.floor(values.length / 2)]! : null;
    };
    const sorted = runs.slice().sort((a, b) => (a?.lcp ?? 0) - (b?.lcp ?? 0));
    const representative = sorted[Math.floor(sorted.length / 2)] ?? runs[0]!;
    collected[route.id] = {
      path: route.path,
      auth: route.auth,
      ttfb: medianOf('ttfb'),
      dcl: medianOf('dcl'),
      load: medianOf('load'),
      lcp: representative.lcp,
      cls: representative.cls,
      shifts: representative.shifts,
      longTasks: representative.longTasks,
      longTaskMs: representative.longTaskMs,
      inp: representative.inp,
      shell: representative.shell,
      content: representative.content,
      bytes: representative.bytes,
      bytesTotal: representative.bytesTotal,
      requests: representative.requests,
      domNodes: representative.domNodes,
      busy: representative.busy,
      textLength: representative.textLength,
    };
    console.log(`PERF ${route.id}`, JSON.stringify(collected[route.id]));
  });
}

test.afterAll(async () => {
  if (!OUT) return;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    `${JSON.stringify({ recorded: new Date().toISOString(), routes: collected }, null, 2)}\n`,
    'utf8'
  );
  expect(Object.keys(collected).length).toBe(ROUTES.length);
});
