import { test } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoElementOverflow,
  expectTouchTargets,
  expectNoTextOverflow,
  takeScreenshot,
  loginAs,
} from './responsive-helpers';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.describe('LinkSnap - responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('dashboard: no overflow, touch targets', async ({ page }) => {
    await page.goto('/linksnap', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoElementOverflow(page);
    await expectTouchTargets(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'linksnap/dashboard');
  });

  test('url shortener input: touch target, no overflow', async ({ page }) => {
    await page.goto('/linksnap', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const input = page
      .locator('input[type="url"], input[placeholder*="رابط"], input[placeholder*="url"]')
      .first();
    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      const box = await input.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 2);
      }
    }
  });

  test('link row cards: touch targets on actions', async ({ page }) => {
    await page.goto('/linksnap', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const viewWidth = page.viewportSize()!.width;

    const actionBtns = page.locator(
      'button[aria-label*="نسخ"], button[aria-label*="تعديل"], button[aria-label*="حذف"]'
    );
    const count = await actionBtns.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = actionBtns.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.x + box.width).toBeLessThanOrEqual(viewWidth + 2);
        }
      }
    }
  });

  test('analytics drawer: no overflow when opened', async ({ page }) => {
    await page.goto('/linksnap', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const analyticsBtn = page.locator('button', { hasText: /التحليلات/ }).first();
    if (await analyticsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analyticsBtn.click();
      await page.waitForTimeout(500);

      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
      await takeScreenshot(page, 'linksnap/analytics-open');
    }
  });

  test('bulk shortener: no overflow on table', async ({ page }) => {
    await page.goto('/linksnap', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
  });
});
