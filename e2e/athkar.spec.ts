import { test, expect, type Page } from '@playwright/test';

/**
 * `/athkar` is a prerendered reading surface: the two collections are in the
 * document, and the only state is the day's count on the device. So the two
 * things worth proving in a browser are that the page is reachable from the
 * `خدماتنا` menu every visitor uses, and that a count survives the reload the
 * real reader actually does — jsdom has no `localStorage` across a document, and
 * the unit tests can only prove the functions, not the page.
 */

async function openFromMenu(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'خدماتنا', exact: true }).click();
  await page.getByRole('menuitem', { name: 'أذكار الصَّباح والمساء' }).click();
  await expect(page).toHaveURL(/\/athkar\/?$/);
}

test('the services menu opens the athkar page', async ({ page }) => {
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

test('the evening tab swaps the collection', async ({ page }) => {
  await page.goto('/athkar');

  await page.getByRole('tab', { name: 'أذكار المساء' }).click();

  await expect(page.locator('[data-athkar-id="amsayna-wa-amsa-al-mulk"]')).toBeVisible();
  await expect(page.locator('[data-athkar-id="asbahna-wa-asbaha-al-mulk"]')).toHaveCount(0);
});
