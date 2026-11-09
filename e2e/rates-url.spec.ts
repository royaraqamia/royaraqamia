import { test, expect } from '@playwright/test';

/**
 * The rates converter's pair, basis and market are the URL once the member
 * changes them (ADR-0147). A refresh and a shared link have to land on the same
 * conversion; the amount and the grams are typed input and stay out.
 */
test('choosing a currency writes the pair into the URL', async ({ page }) => {
  await page.goto('/rates');

  await page.locator('#rates-to').click();
  await page.getByRole('option', { name: /\(EUR\)/ }).click();

  await expect(page).toHaveURL(/\/rates\?from=USD&to=EUR&basis=parallel/);
});

test('a shared pair survives a reload', async ({ page }) => {
  await page.goto('/rates?from=USD&to=EUR&basis=official');

  const to = page.locator('#rates-to');
  await expect(to).toContainText('EUR');
  await expect(page.locator('#rates-from')).toContainText('USD');

  await page.reload();

  await expect(page.locator('#rates-to')).toContainText('EUR');
});
