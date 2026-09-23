import { test, expect } from '@playwright/test';

/**
 * The reduced-motion half of the `lite` contract (issue #123).
 *
 * Emulated browser-wide via the `reducedMotion` context option, so this is the
 * real media query the pre-paint script reads — not a stubbed matchMedia. A
 * fully capable device must still be marked lite when the user has asked for
 * reduced motion.
 */
test.use({
  reducedMotion: 'reduce',
  viewport: { width: 1280, height: 800 },
});

test('marks a capable device that prefers reduced motion', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 16, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 16, configurable: true });
  });

  await page.goto('/', { waitUntil: 'load' });

  const probe = await page.evaluate(() => {
    const root = document.documentElement;
    const backdropFiltered: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const backdrop = getComputedStyle(el).backdropFilter;
      if (backdrop && backdrop !== 'none')
        backdropFiltered.push(el.className.toString().slice(0, 80));
    }
    return {
      isLite: root.classList.contains('lite'),
      backdropFiltered,
    };
  });

  expect(probe.isLite).toBe(true);
  expect(probe.backdropFiltered).toEqual([]);
});
