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

  // The start state has to be the built version, whatever a previous test or a
  // crashed run left in the generated version script.
  writeFileSync(VERSION_SCRIPT, original ?? '');

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

/**
 * ADR-0042: the announcement is the *first* half of the update channel — a build
 * that is downloaded and waiting is worth telling the user about, because a
 * refresh does not release it (measured 2026-10-14 above). Declining is a real
 * answer; the gesture is what moves the document, and it still moves it once.
 */
test('a waiting worker is announced, and the prompt is how a document takes it', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });

  await context.addInitScript(() => {
    const probe = { loads: Number(window.name || 0) + 1, checks: 0 };
    window.name = String(probe.loads);
    (window as unknown as { __swProbe: typeof probe }).__swProbe = probe;
  });

  const page = await context.newPage();
  const loads = () =>
    page
      .evaluate(() => (window as unknown as { __swProbe: { loads: number } }).__swProbe.loads)
      .catch(() => -1);

  writeFileSync(VERSION_SCRIPT, original ?? '');
  await page.goto('/rates', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(7_000);

  const settled = await loads();
  // Nothing is waiting yet, so there is nothing to announce.
  await expect(page.getByTestId('update-prompt')).toBeHidden();

  writeFileSync(
    VERSION_SCRIPT,
    `self.CACHE_VERSION = '${DEPLOY_MARKER}';\nself.ASSET_VERSION = '';\n`
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  // The announcement: a build is downloaded and waiting, and the document is
  // still on the previous one — the prompt tells the truth when it says so.
  await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 30_000 });
  expect(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting)
    )
  ).toBe(true);
  expect(await loads()).toBe(settled);

  // Declining is respected: no reload, and no repeated asking in this document.
  await page.getByRole('button', { name: 'لاحقًا' }).click();
  await expect(page.getByTestId('update-prompt')).toBeHidden();
  expect(await loads()).toBe(settled);

  // A refresh is exactly the case the prompt exists for: it does not release the
  // waiting worker (ADR-0039, measured above), it re-asks in the new document,
  // and this time the gesture is the way through.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'تحديث الآن' }).click();

  // One reload for the gesture, plus the one the refresh already made.
  await expect.poll(loads, { timeout: 30_000 }).toBe(settled + 2);
  await expect(page.getByTestId('update-prompt')).toBeHidden();
  expect(await page.evaluate(async () => (await caches.keys()).join(','))).toContain(DEPLOY_MARKER);

  // No loop: the tab settles on the build its worker serves.
  await page.waitForTimeout(3_000);
  expect(await loads()).toBe(settled + 2);

  await context.close();
});

/**
 * The other half of the decision, and the reason the mechanism above is worth
 * having: a swap waits for the previous worker's clients to go away. A reload
 * does not release a waiting worker (measured 2026-10-14), and the shell's next
 * cold start does — so a client moves to a new deploy on its next launch.
 */
test('a refresh keeps the previous build; the next cold start takes the new one', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const previousCache = (original ?? '').split("'")[1] ?? '';
  expect(previousCache).toMatch(/^royaraqamia-v/);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();

  const cacheKeys = () => page.evaluate(async () => (await caches.keys()).join(','));
  const hasWaiting = () =>
    page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));

  // Start from the build this test is going to replace, so the outcome does not
  // depend on what the test above left behind.
  writeFileSync(VERSION_SCRIPT, original ?? '');

  await page.goto('/rates', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  // Let the registration's own update check finish before the deploy.
  await page.waitForTimeout(7_000);
  expect(await cacheKeys()).toContain(previousCache);

  writeFileSync(
    VERSION_SCRIPT,
    `self.CACHE_VERSION = '${DEPLOY_MARKER}';\nself.ASSET_VERSION = '';\n`
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(
    async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
    null,
    { timeout: 30_000 }
  );

  // A refresh keeps the previous build: the waiting worker survives the
  // navigation, and the page is still served by the previous worker's caches.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8_000);
  expect(await hasWaiting()).toBe(true);
  const afterRefresh = await cacheKeys();
  expect(afterRefresh).toContain(previousCache);

  // A fresh browsing context — the shell's next cold start — is what releases
  // it; `activate` then deletes the previous build's caches.
  await page.close();
  const relaunched = await context.newPage();
  await relaunched.goto('/rates', { waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      async () =>
        (await relaunched.evaluate(async () => (await caches.keys()).join(','))).includes(
          previousCache
        ),
      {
        timeout: 30_000,
      }
    )
    .toBe(false);
  expect(await relaunched.evaluate(async () => (await caches.keys()).join(','))).toContain(
    DEPLOY_MARKER
  );

  await context.close();
});
