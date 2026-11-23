import { expect, test, type Page } from '@playwright/test';

/**
 * Gate for #1647 (WCAG 2.4.3): a dialog opened from a plain button has no Radix
 * trigger to restore focus to, so closing it used to drop focus on `<body>`.
 * The measurement is the one the audit used — 393 x 852 at DPR 2.75, dark,
 * `ar` — and it covers every dismissal path, not only Escape.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

const ROUTES = ['/', '/rates', '/quran', '/news', '/community/explore'];

const launcher = (page: Page) => page.locator('[data-assistant-launcher]');
const sheet = (page: Page) => page.locator('[data-assistant-panel]');

async function openSheetWithKeyboard(page: Page): Promise<void> {
  await launcher(page).focus();
  await expect(launcher(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(sheet(page)).toBeVisible();
}

async function focusInsideSheet(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    const content = document.querySelector('[data-assistant-panel]');
    return Boolean(active && content?.contains(active));
  });
}

for (const route of ROUTES) {
  test(`${route}: Escape closes the sheet and returns focus to the launcher`, async ({ page }) => {
    await page.goto(route);
    await openSheetWithKeyboard(page);

    await page.keyboard.press('Escape');
    await expect(sheet(page)).toBeHidden();
    await expect(launcher(page)).toBeFocused();
  });
}

test('the close button and a backdrop click return focus too', async ({ page }) => {
  await page.goto('/');

  await openSheetWithKeyboard(page);
  await sheet(page).getByRole('button', { name: 'إغلاق' }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();

  await openSheetWithKeyboard(page);
  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 8, y: 8 } });
  await expect(sheet(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
});

test('the sheet still opens inside itself and traps Tab while open', async ({ page }) => {
  await page.goto('/');
  await openSheetWithKeyboard(page);

  expect(await focusInsideSheet(page)).toBe(true);
  for (let press = 0; press < 6; press += 1) {
    await page.keyboard.press('Tab');
    expect(await focusInsideSheet(page)).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(launcher(page)).toBeFocused();
});

test('the notes composer returns focus to its FAB', async ({ page }) => {
  await page.goto('/?tab=/notes');
  await expect(page.locator('[data-notes-ready="true"]')).toBeAttached();

  const fab = page.locator('#btn-new-note');
  await fab.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#composer-note-body')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#composer-note-body')).toBeHidden();
  await expect(fab).toBeFocused();
});
