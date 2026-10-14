import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A worker swap has to reach a running client with no gesture and no prompt
 * (ADR-0039): the Android shell has no reload control, so the app re-checks for
 * a new worker itself while the document is visible, and replaces the document
 * when a swapped worker takes control.
 *
 * Runs against a production build, because the worker is only registered outside
 * development:
 *   CI=true SW_UPDATE_E2E=1 npx playwright test e2e/sw-update.spec.ts
 * `CI=true` is what makes playwright.config.ts build and `next start`.
 *
 * Simulating a deploy means changing the version script the worker imports; it
 * is generated and git-ignored, and this file restores it afterwards.
 */

const ENABLED = process.env.SW_UPDATE_E2E === '1';
const VERSION_SCRIPT = resolve(process.cwd(), 'public', 'sw-version.js');
const DEPLOY_MARKER = 'royaraqamia-sw-update-e2e';

interface SwProbe {
  /** Documents loaded in this context; `window.name` survives a reload. */
  loads: number;
  /** Calls the app made to `getRegistration()` — the re-check, and only that. */
  checks: number;
}

test.skip(!ENABLED, 'requires SW_UPDATE_E2E=1 (production build)');

let original: string | null = null;

test.beforeAll(() => {
  original = readFileSync(VERSION_SCRIPT, 'utf8');
});

test.afterAll(() => {
  if (original !== null) writeFileSync(VERSION_SCRIPT, original);
});

test('a deploy reaches a running client without a reload loop', async ({ browser }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });

  // Probe the re-check. `getRegistration()` is called by `sw-update.ts` and
  // nowhere else in the app, so counting it isolates the app's re-check from the
  // browser's own update checks.
  await context.addInitScript(() => {
    const probe = { loads: Number(window.name || 0) + 1, checks: 0 };
    window.name = String(probe.loads);
    (window as unknown as { __swProbe: typeof probe }).__swProbe = probe;

    const container = navigator.serviceWorker;
    if (!container) return;
    const original = container.getRegistration.bind(container);
    container.getRegistration = ((...args: Parameters<typeof original>) => {
      probe.checks += 1;
      return original(...args);
    }) as typeof container.getRegistration;
  });

  const page = await context.newPage();
  const probe = () => page.evaluate(() => (window as unknown as { __swProbe: SwProbe }).__swProbe);

  // The probe dies with the execution context while the app reloads; -1 means
  // "mid-reload", so a poll can simply ask again.
  const loads = () =>
    page
      .evaluate(() => (window as unknown as { __swProbe: SwProbe }).__swProbe.loads)
      .catch(() => -1);

  await page.goto('/rates', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });

  // `PWAProvider` defers `register()` to `requestIdleCallback` with a 5s ceiling,
  // and that call re-checks for a new worker; let it finish so the deploy below
  // cannot be picked up by a check that is already in flight.
  await page.waitForTimeout(7_000);
  const settled = await probe();

  // Nothing re-checks a document that just sits there — that is the whole reason
  // the shell needs the app to do it.
  await page.waitForTimeout(2_000);
  expect((await probe()).checks).toBe(settled.checks);

  // Deploy: the worker's imported version script changes, which is what installs
  // a new worker even when the worker's own bytes are identical. Remove the
  // app's re-check and the poll below is what fails.
  writeFileSync(
    VERSION_SCRIPT,
    `self.CACHE_VERSION = '${DEPLOY_MARKER}';\nself.ASSET_VERSION = '';\n`
  );

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect
    .poll(async () => (await probe()).checks, { timeout: 15_000 })
    .toBeGreaterThan(settled.checks);

  // The re-check installs the new worker; it must not take control on its own,
  // and the document must not have reloaded yet.
  await page.waitForTimeout(3_000);
  const waiting = await page.evaluate(async () =>
    Boolean((await navigator.serviceWorker.getRegistration())?.waiting)
  );
  expect(waiting).toBe(true);
  expect((await probe()).loads).toBe(settled.loads);

  // A client that is launched rather than reloaded sees a waiting worker release
  // when the old client goes away; `SKIP_WAITING` stands in for that release, and
  // the app has to bring itself onto the new build.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  await expect.poll(loads, { timeout: 30_000 }).toBe(settled.loads + 1);

  // No loop: the tab settles instead of reloading its way to the new build.
  await page.waitForTimeout(3_000);
  expect(await loads()).toBe(settled.loads + 1);

  const cacheKeys = await page.evaluate(async () => (await caches.keys()).join(','));
  expect(cacheKeys).toContain(DEPLOY_MARKER);

  await context.close();
});
