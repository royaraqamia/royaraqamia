import { test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoElementOverflow,
  expectTouchTargets,
  expectMinFontSize,
  expectNoTextOverflow,
  takeScreenshot,
  loginAs,
} from './responsive-helpers';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.describe('SpendTrack - responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('dashboard: no overflow, touch targets', async ({ page }) => {
    await page.goto('/spendtrack', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoElementOverflow(page);
    await expectTouchTargets(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'spendtrack/dashboard');
  });

  test('categories page: no overflow, touch targets', async ({ page }) => {
    await page.goto('/spendtrack/categories', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoElementOverflow(page);
    await expectTouchTargets(page);
    await expectMinFontSize(page);
    await takeScreenshot(page, 'spendtrack/categories');
  });

  test('expense list: metadata text readable', async ({ page }) => {
    await page.goto('/spendtrack', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectMinFontSize(page, 11);
    await expectNoTextOverflow(page);
  });

  test('transaction filters: no overflow, touch targets', async ({ page }) => {
    await page.goto('/spendtrack', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const filterBtns = page.locator('button[aria-label*="فلتر"], button:has-text("فلتر")');
    const count = await filterBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = filterBtns.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    }

    await expectNoHorizontalOverflow(page);
  });
});
