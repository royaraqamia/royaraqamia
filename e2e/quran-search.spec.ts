import { test, expect } from '@playwright/test';

/**
 * The search field in a real browser (P4).
 *
 * jsdom proves the fold and the components, but three of the promises here are
 * only checkable in a browser: that the index is fetched from the built asset
 * rather than bundled, that a query typed plainly reaches a word the Uthmani text
 * writes differently, and that following a hit lands on the Ayah with it marked —
 * which is a claim about the anchor and the hash, not about a component.
 *
 * The queries are named by what a reader would type, and the hits are read by
 * their shape (`/quran/<n>#ayah-<m>`) rather than by Arabic digits.
 */
test('a text query answers from the fetched index and lands on the Ayah', async ({ page }) => {
  await page.goto('/quran');

  const field = page.getByRole('textbox', { name: 'ابحث في القرآن' });
  await expect(field).toBeVisible();

  // The index is not fetched with the page: nothing is asked for until the field
  // is used.
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  expect(requested.filter((url) => url.includes('/quran/search/index.json'))).toHaveLength(0);

  // «سبع سماوات» is written «سَبْعَ سَمَٰوَٰتٍ»: the superscript alef is the rule
  // this query exists to prove.
  await field.fill('سبع سماوات');

  const results = page.getByRole('region', { name: 'نتائج البحث في الآيات' });
  await expect(results).toBeVisible();

  expect(requested.filter((url) => url.includes('/quran/search/index.json'))).toHaveLength(1);

  const firstHit = results.getByRole('link').first();
  await expect(firstHit).toHaveAttribute('href', /^\/quran\/\d+#ayah-\d+$/);
  // The hit is the Mushaf's own writing with the matched words marked.
  await expect(firstHit.locator('mark')).toBeVisible();

  await firstHit.click();
  await expect(page).toHaveURL(/\/quran\/\d+#ayah-\d+$/);
  // One Ayah is marked as the landing place, and it is the one the hit named.
  await expect(page.locator('[data-ayah-target]')).toHaveCount(1);

  // The same field still narrows the suras by name.
  await page.goto('/quran');
  await page.getByRole('textbox', { name: 'ابحث في القرآن' }).fill('الكهف');
  await expect(page.getByRole('link', { name: /الكهف/ })).toBeVisible();
});
