import { test, expect, type Page } from '@playwright/test';

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

  await page.getByRole('button', { name: 'تطبيق جديد' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'القرآن الكريم' })
    .getByRole('button', { name: 'إزالة' })
    .click();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('ابدأ بتطبيقك الأوَّل');
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
