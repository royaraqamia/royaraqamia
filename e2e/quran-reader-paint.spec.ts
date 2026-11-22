import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

/**
 * The reader's first paint (#1738). Both causes of its CLS were boxes decided
 * after the document painted: the tafsir control arrived with hydration, and the
 * Uthmani face swapped in over an Arabic fallback with no matching metrics. The
 * control is now in the server HTML and the face is optional, so neither moves
 * the text. These specs keep both halves true.
 */

async function readerHeight(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.body.scrollHeight);
}

/** CLS as the page's own PerformanceObserver sees it, ignoring recent input. */
async function measureCls(browser: Browser, path: string, blockFonts: boolean) {
  const context: BrowserContext = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ar',
  });
  try {
    if (blockFonts) await context.route('**/*.woff2', (route) => route.abort());

    const page = await context.newPage();
    await page.addInitScript(() => {
      const state = { cls: 0 };
      (window as unknown as { __clsState?: typeof state }).__clsState = state;
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
            if (!shift.hadRecentInput) state.cls += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // CLS is optional on engines without LayoutShift.
      }
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    return page.evaluate(
      () => (window as unknown as { __clsState?: { cls: number } }).__clsState?.cls ?? 0
    );
  } finally {
    await context.close();
  }
}

test('the tafsir control is in the first paint and the upgrade moves nothing', async ({ page }) => {
  await page.goto('/quran/1', { waitUntil: 'load' });

  const ayahs = await page.locator('article[data-ayah-card]').count();
  const controls = await page.locator('[data-tafsir-slot] > *').count();
  expect(controls).toBe(ayahs);
  const atLoad = await readerHeight(page);

  // The link becomes a button on hydration; both wear the same box.
  await expect(page.locator('[data-tafsir-ayah="1"] button')).toBeVisible();
  await page.waitForTimeout(2000);

  expect(await readerHeight(page)).toBe(atLoad);
});

test('without JavaScript every ayah has a link to its tafsir address', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/quran/1', { waitUntil: 'load' });

    const ayahs = await page.locator('article[data-ayah-card]').count();
    const links = page.locator('[data-tafsir-slot] a.ayah-tafsir-toggle');
    await expect(links).toHaveCount(ayahs);

    for (let ayah = 1; ayah <= ayahs; ayah += 1) {
      await expect(links.nth(ayah - 1)).toHaveAttribute('href', `?tafsir=${ayah}#ayah-${ayah}`);
      await expect(links.nth(ayah - 1)).toHaveText('التفسير');
    }
  } finally {
    await context.close();
  }
});

test('the Mushaf face arriving or being blocked reflows the reader the same', async ({
  browser,
}) => {
  const blocked = await measureCls(browser, '/quran/2', true);
  const served = await measureCls(browser, '/quran/2', false);

  expect(Math.abs(blocked - served)).toBeLessThanOrEqual(0.01);
});
