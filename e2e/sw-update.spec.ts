import { test, expect, type Page } from '@playwright/test';
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
// The worker names its caches by schema, not by build (#488), so a deploy no
// longer shows up as a new cache name. What a deploy changes is the stamp on the
// entries it writes, which is what these tests read.
const DATA_CACHE = 'royaraqamia-data-v1';
const BUILD_HEADER = 'x-sw-build';

/** The build that produced the cached copy of `path`, or '' when none is there. */
function cachedBuild(page: Page, path = '/rates'): Promise<string> {
  return page.evaluate(
    async ({ cacheName, header, path }) => {
      const cache = await caches.open(cacheName);
      const response = await cache.match(path);
      return response?.headers.get(header) ?? '';
    },
    { cacheName: DATA_CACHE, header: BUILD_HEADER, path }
  );
}

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

  // The swap keeps the store: the schema-named cache survives it, and the copy
  // the new worker refreshed now names the build that wrote it.
  const cacheKeys = await page.evaluate(async () => (await caches.keys()).join(','));
  expect(cacheKeys).toContain(DATA_CACHE);
  await expect.poll(() => cachedBuild(page), { timeout: 30_000 }).toBe(DEPLOY_MARKER);

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
  // The store survived the deploy; the document in it is now this build's.
  expect(await page.evaluate(async () => (await caches.keys()).join(','))).toContain(DATA_CACHE);
  await expect.poll(() => cachedBuild(page), { timeout: 30_000 }).toBe(DEPLOY_MARKER);

  // No loop: the tab settles on the build its worker serves.
  await page.waitForTimeout(3_000);
  expect(await loads()).toBe(settled + 2);

  await context.close();
});

/**
 * ADR-0055: the offer names a worker, and the gesture is bounded.
 *
 * A `SKIP_WAITING` posted to a worker the browser has already superseded
 * activates nothing and reports nothing — no event, no error. The button's label
 * is component state that only the document unloading clears, so without a
 * deadline the client sits on «جاري التحديث...» for good. Simulated by dropping
 * the message, which is what silence looks like from the page.
 */
test('a gesture that lands nowhere still moves the document', async ({ browser }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });

  await context.addInitScript(() => {
    const probe = { loads: Number(window.name || 0) + 1 };
    window.name = String(probe.loads);
    (window as unknown as { __swProbe: { loads: number } }).__swProbe = probe;
  });

  const page = await context.newPage();
  const warns: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warns.push(message.text());
  });
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

  writeFileSync(
    VERSION_SCRIPT,
    `self.CACHE_VERSION = '${DEPLOY_MARKER}';\nself.ASSET_VERSION = '';\n`
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('update-prompt')).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    ServiceWorker.prototype.postMessage = function dropped() {
      // The message a superseded worker never receives.
    };
  });
  await page.getByRole('button', { name: 'تحديث الآن' }).click();

  // The label was honest only while something was happening; the document moves
  // itself forward instead of staying on a dead gesture.
  await expect.poll(loads, { timeout: 30_000 }).toBe(settled + 1);
  expect(warns.some((line) => line.includes('gesture never landed'))).toBe(true);

  // A reload does not release a waiting worker (ADR-0039), so the update is still
  // on offer — what the deadline buys is that the offer is live again instead of a
  // frozen label, and that the failure left a trace.
  await expect(page.getByRole('button', { name: 'تحديث الآن' })).toBeVisible();

  await context.close();
});

/**
 * One offer at a time (ADR-0043). Inside the shell a newer APK is announced
 * natively, so the page holds its own reload offer back while the shell's is
 * pending. To the page the shell is two things and nothing else: a token in its
 * user agent, and the manifest it fetches from its own origin — so that is what
 * this stands up, with a genuinely waiting worker behind it.
 */
test('the shell keeps the page quiet while it announces its own update', async ({ browser }) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/83.0.4103.106 Mobile Safari/537.36 RoyaraqamiaShell/20000',
  });
  const page = await context.newPage();

  // The published APK is one shell ahead of this one.
  await page.route('**/android/latest.json', (route) =>
    route.fulfill({
      json: {
        versionCode: 20001,
        minSupportedVersionCode: 20000,
        apkUrl: 'https://example.test/shell.apk',
      },
    })
  );

  writeFileSync(VERSION_SCRIPT, original ?? '');
  await page.goto('/rates', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(7_000);

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

  // A web update is genuinely waiting, and the page still says nothing: the
  // shell is the one with an update to talk about.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('update-prompt')).toBeHidden();

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

  // The build the device is on before the deploy below. The caches are named by
  // schema (#488), so a build is identified by the stamp its entries carry, not
  // by a cache name.
  const previousBuild = (original ?? '').split("'")[1] ?? '';
  expect(previousBuild).toMatch(/^royaraqamia-v/);

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
  expect(await cacheKeys()).toContain(DATA_CACHE);
  await expect.poll(() => cachedBuild(page), { timeout: 30_000 }).toBe(previousBuild);

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
  // navigation, and the page is still served by it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8_000);
  expect(await hasWaiting()).toBe(true);
  const afterRefresh = await cacheKeys();
  expect(afterRefresh).toContain(DATA_CACHE);

  // A fresh browsing context — the shell's next cold start — is what releases
  // it. The new worker keeps the store rather than deleting the previous build's
  // (#488), so the cold start costs no shell downloads; what moves is the stamp,
  // which the new build already rewrote when its install refreshed the route.
  await page.close();
  const relaunched = await context.newPage();
  await relaunched.goto('/rates', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => cachedBuild(relaunched), { timeout: 30_000 }).toBe(DEPLOY_MARKER);
  expect(await relaunched.evaluate(async () => (await caches.keys()).join(','))).toContain(
    DATA_CACHE
  );

  await context.close();
});
