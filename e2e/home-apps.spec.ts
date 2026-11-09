import { test, expect, type Page } from '@playwright/test';

/**
 * The homepage is the app door (ADR-0146): a visitor with no apps sees one
 * action, the picker adds an app to a strip that survives a reload, and removing
 * it returns the empty state.
 *
 * The state lives in `localStorage` for a guest, so a fresh context is the empty
 * state and every later step is the visitor's own device.
 */
async function emptyState(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ابدأ بتطبيقك الأوَّل');
  await expect(page.getByRole('link', { name: 'القرآن الكريم' })).toHaveCount(0);
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

  await expect(page.getByRole('link', { name: 'القرآن الكريم' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'القرآن الكريم' })).toBeVisible();
});

test('removing the only app returns the empty state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('royaraqamia:home-services:v1', JSON.stringify(['/quran']))
  );
  await page.reload();

  await expect(page.getByRole('link', { name: 'القرآن الكريم' })).toBeVisible();

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

test('an app keeps its own route when opened from the strip', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() =>
    window.localStorage.setItem('royaraqamia:home-services:v1', JSON.stringify(['/athkar']))
  );
  await page.reload();

  await page.getByRole('link', { name: 'أذكار الصَّباح والمساء' }).click();
  await expect(page).toHaveURL(/\/athkar\/?$/);
});
