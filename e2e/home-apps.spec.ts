import { test, expect, type Page } from '@playwright/test';
import { SITE_NAME, siteTitle } from '@/frontend/shared/metadata';
import { SERVICES_BY_ROUTE } from '@/frontend/ui/navbar/services-link';
import { HOME_SERVICE_ROUTES } from '@/shared/contracts/home-services-catalog';

import { signIn } from './sign-in';

/**
 * The homepage is the app door (ADR-0146): a visitor with no apps sees one
 * action, the picker adds an app to a strip that survives a reload, and removing
 * it returns the empty state.
 *
 * The state lives in `localStorage` for a guest, so a fresh context is the empty
 * state and every later step is the visitor's own device. The merge test is the
 * exception: it signs in with the shared account to prove the device's list
 * joins the account's, and restores the account's own list afterwards.
 */

const GUEST_KEY = 'royaraqamia:home-services:v1';
const ACCOUNT = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
async function emptyState(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ابدأ بتطبيقك الأوَّل');
  await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toHaveCount(0);
  await expect(page).toHaveTitle(SITE_NAME);
}

test('a visitor adds an app and keeps it across a reload', async ({ page }) => {
  await emptyState(page);

  await page.getByRole('button', { name: 'أضِف تطبيقًا' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'القرآن الكريم' })
    .getByRole('button', { name: 'إضافة' })
    .click();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toBeVisible();
});

test('removing the only app returns the empty state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('royaraqamia:home-services:v1', JSON.stringify(['/quran']))
  );
  await page.reload();

  await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toBeVisible();

  await page.getByRole('button', { name: 'التَّطبيقات', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'القرآن الكريم' })
    .getByRole('button', { name: 'إزالة' })
    .click();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('ابدأ بتطبيقك الأوَّل');
});

/**
 * Reordering (ADR-0202): the mode is the only way in, the keyboard and the
 * pointer both save the whole order, and the device keeps it across a reload.
 */
test('a visitor reorders the strip with the keyboard and keeps the order', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem(
      'royaraqamia:home-services:v1',
      JSON.stringify(['/quran', '/athkar', '/notes'])
    )
  );
  await page.reload();

  await page.getByRole('button', { name: 'ترتيب' }).click();
  await expect(page.getByRole('button', { name: 'تم' })).toBeVisible();

  await page.getByRole('tab', { name: 'القرآن الكريم' }).focus();
  // The app is RTL, so ArrowLeft walks toward the end of the strip.
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'تم' }).click();

  await expect(page.getByRole('tab').nth(0)).toHaveText('أذكار الصَّباح والمساء');
  expect(
    JSON.parse(
      (await page.evaluate(() => window.localStorage.getItem('royaraqamia:home-services:v1'))) ??
        '[]'
    )
  ).toEqual(['/athkar', '/quran', '/notes']);

  await page.reload();
  await expect(page.getByRole('tab').nth(0)).toHaveText('أذكار الصَّباح والمساء');
});

test('a visitor drags a tab and the drop saves the order', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem(
      'royaraqamia:home-services:v1',
      JSON.stringify(['/quran', '/athkar', '/notes'])
    )
  );
  await page.reload();

  await page.getByRole('button', { name: 'ترتيب' }).click();

  const first = page.getByRole('tab', { name: 'القرآن الكريم' });
  const box = await first.boundingBox();
  if (!box) throw new Error('the first tab has no box');

  // One slot to the left is the second tab in RTL.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByRole('tab').nth(0)).toHaveText('أذكار الصَّباح والمساء');
  expect(
    JSON.parse(
      (await page.evaluate(() => window.localStorage.getItem('royaraqamia:home-services:v1'))) ??
        '[]'
    )
  ).toEqual(['/athkar', '/quran', '/notes']);
  await page.getByRole('button', { name: 'تم' }).click();
  await page.reload();
  await expect(page.getByRole('tab').nth(0)).toHaveText('أذكار الصَّباح والمساء');
});

test('a tab opens its app under the strip and stays on the door', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('royaraqamia:home-services:v1', JSON.stringify(['/athkar']))
  );
  await page.reload();

  await page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' }).click();
  // The tab is a selection, not a navigation (ADR-0151): the door stays the
  // address, the strip stays mounted and the app's own surface renders under it.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('tab', { selected: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

/**
 * The door's document title (WCAG 2.2 SC 2.4.2, #1932): the one shared document
 * the site serves is titled by the tab the browser settles on, from the same
 * entry the strip's pill is drawn from. The loop over the catalog is the gate;
 * nine hand-written titles would drift.
 */
test('every app names the door it is drawn in', async ({ page }) => {
  for (const key of HOME_SERVICE_ROUTES) {
    const label = SERVICES_BY_ROUTE.get(key)?.label;
    if (!label) throw new Error(`no shared label for ${key}`);

    await page.goto(`/?tab=${key}`);
    await expect(page).toHaveTitle(siteTitle(label));
  }
});

test('choosing another tab retitles the door, and the empty state keeps the site name', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    ({ key, routes }) => window.localStorage.setItem(key, JSON.stringify(routes)),
    { key: GUEST_KEY, routes: ['/news', '/rates'] }
  );
  await page.reload();

  const news = SERVICES_BY_ROUTE.get('/news')?.label;
  const rates = SERVICES_BY_ROUTE.get('/rates')?.label;
  if (!news || !rates) throw new Error('the catalog lost one of the two labels this test needs');

  await expect(page).toHaveTitle(siteTitle(news));

  await page.getByRole('tab', { name: rates }).click();
  await expect(page).toHaveTitle(siteTitle(rates));

  // No apps and no address: the door is the site again, not the last app.
  await page.evaluate((key) => window.localStorage.removeItem(key), GUEST_KEY);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page).toHaveTitle(SITE_NAME);
});

test('the door is still the shared, cached document', async ({ page }) => {
  const response = await page.goto('/?tab=/news');
  const cacheControl = response?.headers()['cache-control'] ?? '';

  // One shared, cached document (ADR-0031): `?tab=` is read in the browser, so
  // it must not make `/` dynamic to name itself. A dev document is never cached,
  // so the assertion lives where the production build is served — the CI e2e job.
  // `check:precache` proves `/` prerenders; this proves the tab kept the promise.
  test.skip(cacheControl === 'no-store', 'the dev server does not send the production header');

  expect(cacheControl).toContain('public');
  expect(cacheControl).toContain('s-maxage');
  expect(cacheControl).not.toContain('private');
});

/**
 * The sign-in merge (ADR-0146): the account's apps keep their positions, the
 * guest's are appended, the device copy is written to the account and then
 * cleared — one truth, and no second list to merge again on the next visit.
 */
test('a guest’s apps join the account’s on sign-in, once', async ({ page, baseURL, context }) => {
  test.skip(!ACCOUNT, 'needs E2E_TEST_EMAIL and E2E_TEST_PASSWORD to sign in');

  const url = new URL('/api/me/home-services', baseURL).toString();
  await signIn(context, baseURL!);

  const read = async () =>
    ((await (await context.request.get(url)).json()) as { data?: string[] }).data ?? [];
  const write = async (services: string[]) =>
    context.request.put(url, {
      data: { services },
      // The route refuses a write that does not come from its own origin (the
      // guard a cross-site form cannot satisfy). The API client is not a browser
      // and sends no `Origin`, so it declares the fetch metadata the browser
      // would have sent.
      headers: {
        'Content-Type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
    });

  const baseline = await context.request.get(url);
  test.skip(
    !baseline.ok(),
    `the home_services table is not applied to this environment (${baseline.status()})`
  );
  const original = ((await baseline.json()) as { data?: string[] }).data ?? [];

  try {
    // A known account baseline: the account's own order is what the merge has to
    // preserve, so it must not be whatever a previous run left.
    const baselineWrite = await write(['/quran']);
    expect(
      baselineWrite.ok(),
      `baseline write failed (${baselineWrite.status()}): ${await baselineWrite.text()}`
    ).toBe(true);

    // Back to a guest with one app on the device, then sign in again.
    await context.clearCookies();
    await page.goto('/');
    await page.evaluate(
      ({ key, routes }) => window.localStorage.setItem(key, JSON.stringify(routes)),
      { key: GUEST_KEY, routes: ['/athkar'] }
    );
    await page.reload();
    await expect(page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' })).toBeVisible();

    await signIn(context, baseURL!);
    await page.reload();

    // Both, account order first: quran was already there, athkar joined it.
    await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' })).toBeVisible();
    expect(await read()).toEqual(['/quran', '/athkar']);

    // The merge happened once: the device copy is gone and a reload is stable.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), GUEST_KEY)).toBeNull();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'القرآن الكريم' })).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' })).toHaveCount(1);
  } finally {
    // The shared account is not this spec's to keep.
    await write(original);
    await page.evaluate((key) => window.localStorage.removeItem(key), GUEST_KEY).catch(() => {});
  }
});
