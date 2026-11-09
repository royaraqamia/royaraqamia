import { test, expect } from '@playwright/test';

/**
 * An open tafsir is `?tafsir=N` (ADR-0147): a shared link opens the study beside
 * the Ayah it belongs to, and closing it puts the address bar back. The hash
 * (`#ayah-N`) stays, so an anchor and its tafsir are one address.
 */
test('a shared tafsir link opens the panel', async ({ page }) => {
  await page.goto('/quran/1?tafsir=5#ayah-5');

  await expect(page.locator('#ayah-tafsir-5')).toBeVisible();
  await expect(page.locator('[data-tafsir-ayah="5"] button')).toHaveAttribute(
    'aria-expanded',
    'true'
  );
});

test('closing the panel clears the query and keeps the anchor', async ({ page }) => {
  await page.goto('/quran/1?tafsir=5#ayah-5');

  await page.locator('[data-tafsir-ayah="5"] button').click();

  await expect(page).toHaveURL(/\/quran\/1#ayah-5$/);
  await expect(page.locator('#ayah-tafsir-5')).toHaveCount(0);
});
