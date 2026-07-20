import { test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectTouchTargets,
  expectMinFontSize,
  expectNoTextOverflow,
  takeScreenshot,
} from './responsive-helpers';

test.describe('Main site - responsive', () => {
  test('homepage: no overflow, touch targets, font sizes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await expectMinFontSize(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'main/homepage');
  });

  test('homepage: hero section visible and within viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const hero = page.locator('text=شريكك الاستراتيجي').first();
    await expectNoHorizontalOverflow(page);
    const box = await hero.boundingBox();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  });

  test('privacy page: no overflow', async ({ page }) => {
    await page.goto('/privacy', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectMinFontSize(page);
    await takeScreenshot(page, 'main/privacy');
  });

  test('terms page: no overflow', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectMinFontSize(page);
    await takeScreenshot(page, 'main/terms');
  });

  test('app-info page: no overflow', async ({ page }) => {
    await page.goto('/app-info', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectMinFontSize(page);
    await takeScreenshot(page, 'main/app-info');
  });

  test('blog listing: no overflow', async ({ page }) => {
    await page.goto('/blog', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectMinFontSize(page);
    await takeScreenshot(page, 'main/blog');
  });

  test('verify page: no overflow, touch targets', async ({ page }) => {
    await page.goto('/verify', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await takeScreenshot(page, 'main/verify');
  });

  test('login page: no overflow, touch targets', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await takeScreenshot(page, 'main/login');
  });

  test('signup page: no overflow, touch targets', async ({ page }) => {
    await page.goto('/auth/signup', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await takeScreenshot(page, 'main/signup');
  });

  test('mobile menu opens and closes without overflow', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const toggle = page.locator('button[aria-label="فتح القائمة"]');
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(500);

      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);

      const closeBtn = page.locator('button[aria-label="إغلاق القائمة"]');
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
  });
});
