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

/**
 * The marks face is small enough to fetch at paint, but a sura that contains
 * none of its three code points should not fetch it at all. `preload: false`
 * is what makes that decision the browser's rather than the build's. Captured
 * at the reader's measured phone size (393 x 852 @ 2.75), like the audit.
 */
test.describe('the marks face on the wire', () => {
  test.use({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
  });

  test('a sura with no marks requests no marks face', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (/AmiriQuran/i.test(request.url())) requests.push(request.url());
    });

    await page.goto('/quran/1');
    await page.evaluate(() => document.fonts.ready);

    expect(requests).toEqual([]);
  });

  test('a sura with the marks fetches one face under a kilobyte', async ({ page }) => {
    const bodies: Promise<number>[] = [];
    page.on('response', (response) => {
      if (/AmiriQuran/i.test(response.url())) {
        bodies.push(response.body().then((body) => body.length));
      }
    });

    await page.goto('/quran/2');
    await page.evaluate(() => document.fonts.ready);
    const sizes = await Promise.all(bodies);

    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toBeLessThanOrEqual(1024);
  });
});
