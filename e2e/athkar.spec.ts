import { test, expect, type Page } from '@playwright/test';

/**
 * `/athkar` is a prerendered reading surface: the two collections are in the
 * document, and the only state is the day's count on the device. The sitting
 * itself is the URL (ADR-0147): `/athkar` is the morning and `/athkar/evening`
 * the evening, so the browser tests prove the picker still opens it, a count
 * survives a reload, and a shared evening link lands on the evening list.
 */

async function openFromMenu(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'تطبيقاتنا', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'أذكار الصَّباح والمساء' })
    .getByRole('button', { name: 'إضافة' })
    .click();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: 'أذكار الصَّباح والمساء' }).click();
  // A tab is state on the door (ADR-0151): the address stays `/` and the
  // reader renders under the strip, so opening an app is not a navigation.
  await expect(page).toHaveURL(/\/$/);
}

test('the picker adds athkar to the homepage and opens it', async ({ page }) => {
  await openFromMenu(page);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('أذكار');
  await expect(page.getByRole('tab', { name: 'أذكار الصَّباح' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('a count survives a reload', async ({ page }) => {
  await page.goto('/athkar');

  const counter = page.getByRole('button', { name: 'عدّ الذكر 2', exact: true });
  await expect(counter).toContainText('0 من 3');
  await counter.click();
  await expect(counter).toContainText('1 من 3');

  await page.reload();

  const restored = page.getByRole('button', { name: 'عدّ الذكر 2', exact: true });
  await expect(restored).toContainText('1 من 3');
});

test('the evening tab is its own URL and survives a reload', async ({ page }) => {
  await page.goto('/athkar');

  await page.getByRole('tab', { name: 'أذكار المساء' }).click();

  await expect(page).toHaveURL(/\/athkar\/evening$/);
  await expect(page.locator('[data-athkar-id="amsayna-wa-amsa-al-mulk"]')).toBeVisible();
  await expect(page.locator('[data-athkar-id="asbahna-wa-asbaha-al-mulk"]')).toHaveCount(0);

  await page.reload();

  // The sitting is the URL (ADR-0147), so a refresh lands where the reader was.
  await expect(page.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-athkar-id="amsayna-wa-amsa-al-mulk"]')).toBeVisible();
});

test('a shared evening link opens the evening sitting', async ({ page }) => {
  await page.goto('/athkar/evening');

  await expect(page.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(page.locator('[data-athkar-id="asbahna-wa-asbaha-al-mulk"]')).toHaveCount(0);
});
