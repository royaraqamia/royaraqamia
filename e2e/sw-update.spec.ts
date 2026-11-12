import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A deploy reaches a client with no prompt and no gesture, and never moves a
 * document that is only open (ADR-0134).
 *
 * The update surface is a document load: the page checks for a deploy as it
 * loads, and when one is downloaded and waiting it takes control and reloads
 * once. A document that is merely sitting there is never reloaded — there is no
 * timer, no focus check and no prompt — so nothing here dispatches a focus event
 * and waits for the app to notice.
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
function cachedBuild(page: Page, path = '/'): Promise<string> {
  return page.evaluate(
    async ({ cacheName, header, path }) => {
      const cache = await caches.open(cacheName);
      const response = await cache.match(path);
      return response?.headers.get(header) ?? '';
    },
    { cacheName: DATA_CACHE, header: BUILD_HEADER, path }
  );
}

/** Documents loaded in this context; `window.name` survives a reload. */
async function countLoads(page: Page): Promise<number> {
  // The probe dies with the execution context mid-reload; -1 means "ask again",
  // which is what a poll does with a value that is not the one it waits for.
  return page.evaluate(() => Number(window.name || 0)).catch(() => -1);
}

test.skip(!ENABLED, 'requires SW_UPDATE_E2E=1 (production build)');

let original: string | null = null;

test.beforeAll(() => {
  original = readFileSync(VERSION_SCRIPT, 'utf8');
});

test.afterAll(() => {
  if (original !== null) writeFileSync(VERSION_SCRIPT, original);
});

/** One document counting its own loads, and nothing else. */
async function instrument(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // `newPage()` opens on `about:blank` first, which is not a document of the app.
    if (!/^https?:$/.test(location.protocol)) return;
    window.name = String(Number(window.name || 0) + 1);
  });
}

function deploy(): void {
  writeFileSync(
    VERSION_SCRIPT,
    `self.CACHE_VERSION = '${DEPLOY_MARKER}';\nself.ASSET_VERSION = '';\n`
  );
}

/** Opens the app and lets the registration and its own check settle. */
async function open(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  // `PWAProvider` defers `register()` to `requestIdleCallback` with a 5s ceiling.
  await page.waitForTimeout(7_000);
}

test('a refresh takes the deploy, once, and lands the new build', async ({ browser }) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await instrument(context);
  const page = await context.newPage();

  writeFileSync(VERSION_SCRIPT, original ?? '');
  await open(page);
  const settled = await countLoads(page);

  // There is no prompt to show, in any state.
  await expect(page.getByTestId('update-prompt')).toHaveCount(0);
  expect(settled).toBe(1);

  deploy();

  // A document that is only open is never moved: no timer, no focus check, no
  // prompt. This is the half that makes the take safe to ship at all.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(8_000);
  expect(await countLoads(page)).toBe(settled);

  // A manual refresh is the moment the page may move itself: the load finds the
  // deploy, waits for it to be ready, and takes it — the refresh, then one
  // reload onto the new build.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => countLoads(page), { timeout: 90_000 }).toBe(settled + 2);

  // The store survived the deploy; the copy in it is now this build's.
  expect(await page.evaluate(async () => (await caches.keys()).join(','))).toContain(DATA_CACHE);
  await expect.poll(() => cachedBuild(page), { timeout: 30_000 }).toBe(DEPLOY_MARKER);

  // No loop: the tab settles on the build its worker serves.
  await page.waitForTimeout(5_000);
  expect(await countLoads(page)).toBe(settled + 2);

  await context.close();
});

/**
 * ADR-0039: the other half of the channel. A document whose build was replaced by
 * *another* client has already had the previous build's chunks purged from the
 * cache, so it reloads once when it becomes visible — it cannot stay, and it is
 * not the page choosing to interrupt anyone.
 */
test('a document reloads when another client takes the deploy first', async ({ browser }) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await instrument(context);

  writeFileSync(VERSION_SCRIPT, original ?? '');
  const first = await context.newPage();
  await open(first);
  expect(await countLoads(first)).toBe(1);

  deploy();

  // A second document loads and takes the deploy itself, which activates the
  // worker and claims every client it can reach.
  const second = await context.newPage();
  await open(second);
  await expect.poll(() => countLoads(second), { timeout: 90_000 }).toBe(2);

  // The first document was open the whole time; the swap replaced it once.
  await expect.poll(() => countLoads(first), { timeout: 30_000 }).toBe(2);
  await expect.poll(() => cachedBuild(first), { timeout: 30_000 }).toBe(DEPLOY_MARKER);
  await first.waitForTimeout(5_000);
  expect(await countLoads(first)).toBe(2);

  await context.close();
});

/**
 * ADR-0055's backstop, now behind a take instead of a button: a `SKIP_WAITING`
 * posted to a worker the browser has already superseded activates nothing and
 * reports nothing — no event, no error. Simulated by dropping the message, which
 * is what silence looks like from the page. The deadline moves the document
 * anyway, and the guard stops the document that comes back from trying again.
 */
test('a take that lands nowhere still moves the document, and does not loop', async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  await instrument(context);
  // Every document in this context drops the message, so the take that comes back
  // after the deadline is the one the guard has to stop.
  await context.addInitScript(() => {
    ServiceWorker.prototype.postMessage = function dropped() {
      // The message a superseded worker never receives.
    };
  });
  const page = await context.newPage();
  const warns: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warns.push(message.text());
  });

  writeFileSync(VERSION_SCRIPT, original ?? '');
  await open(page);
  const settled = await countLoads(page);

  deploy();

  await page.reload({ waitUntil: 'domcontentloaded' });

  // The refresh, then the reload the deadline owes.
  await expect.poll(() => countLoads(page), { timeout: 90_000 }).toBe(settled + 2);
  expect(warns.some((line) => line.includes('never landed'))).toBe(true);

  // The document that came back refuses a second take inside the guard window,
  // so a worker that cannot activate cannot put the tab in a reload loop.
  await page.waitForTimeout(8_000);
  expect(await countLoads(page)).toBe(settled + 2);

  await context.close();
});

/**
 * One update at a time (ADR-0043): inside the shell a newer APK is announced
 * natively, and installing it brings the newest web build with it — so the page
 * holds its own take back while the shell's card is up. To the page the shell is
 * two things and nothing else: a token in its user agent, and the manifest it
 * fetches from its own origin.
 */
test('the shell keeps the page on its build while it announces its own update', async ({
  browser,
}) => {
  test.setTimeout(240_000);

  const context = await browser.newContext({
    serviceWorkers: 'allow',
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/83.0.4103.106 Mobile Safari/537.36 RoyaraqamiaShell/20000',
  });
  await instrument(context);
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
  await open(page);
  const settled = await countLoads(page);

  deploy();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10_000);

  // The deploy is genuinely waiting, and the page still stays where it is: the
  // shell is the one with an update to talk about.
  expect(
    await page.evaluate(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting)
    )
  ).toBe(true);
  expect(await countLoads(page)).toBe(settled + 1);

  await context.close();
});
