import { test, expect, devices, type CDPSession, type Page } from '@playwright/test';

/**
 * The strip's arrange mode on a touch screen (ADR-0202, amended).
 *
 * The defect this pins: arrange mode marked every pill `touch-none` and armed
 * the drag on `pointerdown`, so on a phone the drag won every gesture and the
 * strip could not be scrolled. Only the two or three pills already on screen
 * were reachable. Now a finger that moves scrolls, a finger that holds lifts the
 * pill, and holding it at an edge carries the strip along.
 *
 * The input is real touch through CDP, on a real device profile. Synthetic
 * `pointermove`s cannot answer the only question that matters here — whether the
 * *browser* scrolled — because they never reach the compositor.
 */

test.use({
  ...devices['Pixel 5'],
  browserName: 'chromium',
  viewport: { width: 393, height: 852 },
});

const KEY = 'royaraqamia:home-services:v1';
const TAB_KEY = 'royaraqamia:home-tab:v1';
/** Nine apps: wider than 393px, so most of the strip starts off screen. */
const APPS = [
  '/news',
  '/rates',
  '/scan',
  '/quran',
  '/athkar',
  '/linksnap',
  '/habitflow',
  '/spendtrack',
  '/notes',
];

const strip = (page: Page) => page.locator('[data-visual="home-app-strip"]');
const pill = (page: Page, route: string) => page.locator(`[data-home-tab="${route}"]`);

async function seed(page: Page) {
  await page.goto('/');
  await page.evaluate(([key, apps]) => localStorage.setItem(key, JSON.stringify(apps)), [
    KEY,
    APPS,
  ] as const);
  await page.reload();
  await expect(page.locator('[data-home-tab]')).toHaveCount(APPS.length);
}

async function arrange(page: Page) {
  await seed(page);
  await page.getByRole('button', { name: 'ترتيب' }).click();
  await expect(page.getByRole('button', { name: 'تم' })).toBeVisible();

  // Playwright scrolls the strip itself to reach «ترتيب», which sits after the
  // last pill. Put the strip back at its start so the gesture begins from the
  // state a member sees, not from the test's own side effect.
  await strip(page).evaluate((el) => el.scrollTo({ left: 0, behavior: 'instant' }));
  await page.waitForTimeout(150);
}

async function stored(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }, KEY);
}

async function scrolled(page: Page): Promise<number> {
  return strip(page).evaluate((el) => el.scrollLeft);
}

async function centreOf(page: Page, route: string) {
  const box = await pill(page, route).boundingBox();
  if (!box) throw new Error(`${route} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) {
  return cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 2, radiusY: 2, force: 1 }],
  });
}

test('a remembered tab opens in view on a narrow strip', async ({ page }) => {
  await seed(page);
  // The tab the member used last, seven pills along: on a 393px screen it is
  // past the edge unless the strip brings it into view.
  await page.evaluate((key) => localStorage.setItem(key, '/spendtrack'), TAB_KEY);
  await page.reload();

  await expect(page.locator('[data-home-tab="/spendtrack"] [role="tab"]')).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect
    .poll(
      async () => {
        const box = await strip(page).boundingBox();
        const target = await pill(page, '/spendtrack').boundingBox();
        if (!box || !target) return false;
        return target.x >= box.x - 1 && target.x + target.width <= box.x + box.width + 1;
      },
      { timeout: 5000 }
    )
    .toBe(true);
});

test('a swipe in arrange mode scrolls the strip and moves nothing', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await arrange(page);

  const before = await scrolled(page);
  const start = await centreOf(page, '/news');

  // Toward the end of an RTL strip: the content moves right, which is the
  // direction that reveals the pills further along.
  await touch(cdp, 'touchStart', start.x, start.y);
  for (let step = 1; step <= 6; step += 1) {
    await touch(cdp, 'touchMove', start.x + step * 25, start.y);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(400);

  expect((await scrolled(page)) - before).toBeLessThan(-60);
  expect(await stored(page)).toEqual(APPS);
});

test('a held pill lifts, follows the finger, and saves where it was dropped', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await arrange(page);

  const target = pill(page, '/news');
  const start = await centreOf(page, '/news');

  await touch(cdp, 'touchStart', start.x, start.y);
  await page.waitForTimeout(500);

  // In hand: the pill owns the gesture and the strip stops scrolling under it.
  await expect(target).toHaveClass(/touch-none/);

  for (let step = 1; step <= 5; step += 1) {
    await touch(cdp, 'touchMove', start.x - step * 30, start.y);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd');

  await expect
    .poll(async () => (await stored(page)).indexOf('/news'), { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(await stored(page)).toHaveLength(APPS.length);
});

test('a pill held at the edge carries the strip to the pills off screen', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await arrange(page);

  const before = await scrolled(page);
  const start = await centreOf(page, '/news');
  const box = await strip(page).boundingBox();
  if (!box) throw new Error('the strip is not drawn');

  await touch(cdp, 'touchStart', start.x, start.y);
  await page.waitForTimeout(500);

  // Pin the pill to the strip's far edge and wait: the scroll has to come from
  // the drag, not from the finger, or the last apps are unreachable in one
  // gesture.
  await touch(cdp, 'touchMove', box.x + 4, start.y);
  await page.waitForTimeout(1400);

  expect((await scrolled(page)) - before).toBeLessThan(-120);

  await touch(cdp, 'touchEnd');

  // The drop landed the app further along than the first screen could show.
  await expect
    .poll(async () => (await stored(page)).indexOf('/news'), { timeout: 5000 })
    .toBeGreaterThan(2);
});
