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

test.describe('HabitFlow - responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('dashboard: no overflow, touch targets', async ({ page }) => {
    await page.goto('/habitflow', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoElementOverflow(page);
    await expectTouchTargets(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'habitflow/dashboard');
  });

  test('dashboard: header buttons fit viewport', async ({ page }) => {
    await page.goto('/habitflow', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const viewWidth = page.viewportSize()!.width;
    const headerBtns = page.locator('button');
    const count = await headerBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = headerBtns.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        if (box) {
          expect(
            box.x + box.width,
            `Button ${i} overflows viewport: x=${box.x} w=${box.width} viewport=${viewWidth}`
          ).toBeLessThanOrEqual(viewWidth + 2);
        }
      }
    }
  });

  test('add habit modal: no overflow, touch targets', async ({ page }) => {
    await page.goto('/habitflow', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    const addBtn = page.locator('button', { hasText: /إضافة|أضف|عادي|جديد/ }).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
      await takeScreenshot(page, 'habitflow/add-modal');

      const closeBtn = page.locator('button[aria-label="إغلاق"]').first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
      }
    }
  });

  test('calendar grid: no overflow', async ({ page }) => {
    await page.goto('/habitflow', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'habitflow/calendar');
  });
});
