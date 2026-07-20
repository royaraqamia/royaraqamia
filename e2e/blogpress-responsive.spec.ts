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

test.describe('BlogPress - responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('dashboard: no overflow, touch targets', async ({ page }) => {
    await page.goto('/blogpress', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    await expectNoHorizontalOverflow(page);
    await expectNoElementOverflow(page);
    await expectTouchTargets(page);
    await expectNoTextOverflow(page);
    await takeScreenshot(page, 'blogpress/dashboard');
  });

  test('editor page: no overflow, toolbar touch targets', async ({ page }) => {
    const createBtn = page.locator('a', { hasText: /مقالة|كتابة|جديد/ }).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    } else {
      await page.goto('/blogpress/editor/new', { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    }

    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await takeScreenshot(page, 'blogpress/editor');
  });
});
