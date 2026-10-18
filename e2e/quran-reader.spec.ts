import { test, expect } from '@playwright/test';

/**
 * The reader's own state, in a real browser: a mark and a place survive a reload,
 * and the index hands them back (ADR-0056).
 *
 * This is the one place the promise can be checked for real. jsdom can prove the
 * store and the components, but "I closed the tab and came back to where I was"
 * is a claim about IndexedDB surviving a navigation, and only a browser can make
 * it.
 *
 * Ayat are located by their `data-bookmark-ayah` number rather than by their
 * accessible name, so the spec does not depend on Arabic-Indic digits.
 */
test('a mark and a reading position survive leaving the page', async ({ page }) => {
  await page.goto('/quran/2');

  const mark = page.locator('[data-bookmark-ayah="255"]');
  // Disabled until the Local Store is open, so waiting for it to be pressable is
  // how the spec knows the reader's records are backed by something durable.
  await expect(mark).toBeEnabled();
  await expect(mark).toHaveAttribute('aria-pressed', 'false');

  await mark.click();
  await expect(mark).toHaveAttribute('aria-pressed', 'true');

  // Read on a little, so there is a place to come back to that is not the top.
  await page.locator('#ayah-280').scrollIntoViewIfNeeded();
  // The position is written once the reader settles, not on every scroll event.
  await page.waitForTimeout(2500);

  await page.reload();
  await expect(page.locator('[data-bookmark-ayah="255"]')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/quran');
  const resume = page.getByRole('link', { name: /أكمل القراءة/ });
  await expect(resume).toContainText('البقرة');

  // It remembers a real place in the sura, not just the sura.
  const ayah = Number((await resume.getAttribute('href'))?.split('#ayah-')[1]);
  expect(ayah).toBeGreaterThan(1);

  const marks = page.getByRole('region', { name: 'علاماتي' });
  await expect(marks).toContainText('البقرة');

  // Following it lands on that ayah rather than at the top of the sura.
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/quran/2#ayah-${ayah}$`));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  // And a mark taken off the list is a mark taken off, not just hidden.
  await page.goto('/quran');
  await page.getByRole('button', { name: /إزالة علامة/ }).click();
  await expect(page.getByRole('region', { name: 'علاماتي' })).toBeHidden();

  await page.goto('/quran/2');
  await expect(page.locator('[data-bookmark-ayah="255"]')).toHaveAttribute('aria-pressed', 'false');
});
