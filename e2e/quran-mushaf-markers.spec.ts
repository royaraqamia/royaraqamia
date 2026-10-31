import { test, expect } from '@playwright/test';

/**
 * The printed Mushaf's boundaries, in a real browser (P5).
 *
 * The page-per-screen view waits on the KFGQPC licence answer, but the mapping does
 * not: a page, a juz, a hizb and a sajdah all belong to an Ayah, and the reader
 * marks the Ayah that opens each. What a browser adds here is that the marks land
 * where the printed Mushaf puts them — page 2 on 2:1, page 3 on 2:6 — and that a
 * printed page number, typed on the index, arrives at the Ayah it names.
 *
 * The mark is read by its `data-` attribute rather than its Arabic label, so the
 * spec does not depend on how the words are set.
 */
test('a page number lands on its first Ayah, and the boundaries are marked', async ({ page }) => {
  await page.goto('/quran/2');

  // The Mushaf's pages inside Al-Baqarah: page 2 opens the sura, page 3 opens 2:6.
  await expect(page.locator('[data-ayah-page="2"]')).toBeVisible();
  await expect(page.locator('[data-ayah-page="3"]')).toBeVisible();
  // And the juz that opens mid-sura, on 2:142.
  await expect(page.locator('[data-ayah-juz="2"]')).toBeVisible();

  // A sajdah says whether the prostration is owed or offered.
  await page.goto('/quran/7');
  await expect(page.locator('[data-ayah-sajda="recommended"]')).toBeVisible();

  // The printed page number a reader already knows, answered from the index.
  await page.goto('/quran');
  await page.getByRole('spinbutton', { name: 'انتقل إلى صفحة' }).fill('604');
  await page.getByRole('button', { name: 'انتقال' }).click();

  await expect(page).toHaveURL(/\/quran\/112#ayah-1$/);
  // The landing place is visible, not just scrolled to.
  await expect(page.locator('[data-ayah-target]')).toHaveCount(1);

  // A page the Mushaf does not have is refused rather than guessed at.
  await page.goto('/quran');
  await page.getByRole('spinbutton', { name: 'انتقل إلى صفحة' }).fill('605');
  await page.getByRole('button', { name: 'انتقال' }).click();
  // By id rather than role: Next's route announcer is an `alert` too.
  await expect(page.locator('#quran-page-error')).toContainText('الصفحة من 1 إلى 604');
  await expect(page).toHaveURL(/\/quran$/);
});
