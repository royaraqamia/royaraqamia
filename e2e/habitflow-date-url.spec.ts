import { test, expect } from '@playwright/test';

/**
 * The selected day is a view in the address bar (ADR-0147): `?date` survives a
 * refresh and can be shared, and changing the day does not add entries to the
 * history — Back still leaves the dashboard.
 */

const DAY = '2026-11-01';

test('a shared day opens that day, and refresh keeps it', async ({ page }) => {
  await page.goto(`/habitflow?date=${DAY}`);

  // The page is a prerendered shell and reads the query after mount, so the
  // return-to-today control is what says the day was applied.
  const today = page.getByRole('button', { name: 'العودة إلى اليوم' });
  await expect(today).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`date=${DAY}`));

  await page.reload();
  await expect(today).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`date=${DAY}`));
});

test('moving a day writes the address bar without a history entry', async ({ page }) => {
  // A real entry to come back to: the dashboard is opened from the door, not as
  // the first page of the tab.
  await page.goto('/');
  await page.goto(`/habitflow?date=${DAY}`);
  await expect(page.getByRole('button', { name: 'العودة إلى اليوم' })).toBeVisible();

  await page.getByRole('button', { name: 'اليوم التَّالي' }).click();
  await expect(page).toHaveURL(/date=2026-11-02/);

  // Back is the platform's: the day change replaced the entry rather than
  // pushing one, so it leaves the dashboard instead of walking the calendar.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('today is the bare dashboard, so the link keeps meaning today', async ({ page }) => {
  await page.goto(`/habitflow?date=${DAY}`);
  await expect(page.getByRole('button', { name: 'العودة إلى اليوم' })).toBeVisible();

  await page.getByRole('button', { name: 'العودة إلى اليوم' }).click();

  await expect(page).not.toHaveURL(/date=/);
  await expect(page.getByRole('button', { name: 'العودة إلى اليوم' })).toHaveCount(0);
});
