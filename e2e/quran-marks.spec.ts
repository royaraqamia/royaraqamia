import { test, expect } from '@playwright/test';

/**
 * The reader sets three silent-letter marks in a second face (ADR 0067).
 *
 * KFGQPC v0.18 maps `U+06DF`, `U+06E3` and `U+06EB` to its ayah-number rosette
 * — one em wide and empty — so `كَفَرُوا۟` printed with a ring in the middle of
 * the word. A `unicode-range` cuts those three out of the Uthmani face and
 * hands them to Amiri Quran, where they are marks with no advance.
 *
 * The seam only exists in a browser, so it is measured there: a mark must add
 * no width. The rosette is ~0.7em and a missing glyph ~0.5em, so anything above
 * a fifth of the font size means the mark went to the wrong face.
 */
test('the silent-letter marks add no advance', async ({ page }) => {
  await page.goto('/quran/2');

  const ayah = page.locator('[data-ayah="6"]');
  await expect(ayah).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const measured = await ayah.evaluate((element) => {
    const measure = (text: string) => {
      const probe = document.createElement('span');
      probe.textContent = text;
      element.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };

    return {
      fontSize: parseFloat(getComputedStyle(element).fontSize),
      // U+06DF, U+06E3, U+06EB.
      widths: ['\u06DF', '\u06E3', '\u06EB'].map(measure),
    };
  });

  expect(measured.fontSize).toBeGreaterThan(0);
  for (const width of measured.widths) {
    expect(width).toBeLessThan(measured.fontSize * 0.2);
  }
});
